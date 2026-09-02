"use client"

import { useEffect, useState } from "react"
import { ChevronDown, MapPin, Map as MapIcon } from "lucide-react"

import { FloatingPanel } from "./FloatingPanel"
import {
  SGC_LAYERS,
  describeValue,
  linkPartsOf,
  sgcLayerByKey,
  shortLinkText,
} from "../utils/sgcLayers"
import { planchaPdfFrom } from "../utils/planchaUrl"

/**
 * Lo que hace legible un mapa geológico: la ficha del punto y la leyenda.
 *
 * **Por qué existe.** Las capas del SGC llegan dibujadas, con su simbología. Eso
 * es lo correcto —el color *es* el dato— pero solo hasta cierto punto: sin
 * leyenda son manchas bonitas, y sin poder preguntarle a una mancha qué unidad
 * es, no se puede trabajar con ellas.
 *
 * **Aparece al tocar el mapa y se cierra con la equis.** La primera versión la
 * dejaba puesta mientras hubiera una capa de geología encendida, diciendo «toca
 * el mapa». Ocupaba sitio permanentemente para no decir nada: una tarjeta que
 * está siempre deja de leerse. Ahora se comporta como cualquier ficha —sale
 * cuando hay algo que enseñar y se va cuando estorba—.
 *
 * **Una sola tarjeta y no dos**, con la ficha y la leyenda dentro. Son dos
 * preguntas del mismo tipo —«qué significa esto que veo»— y separarlas en dos
 * ventanas habría llenado la columna derecha, que ya lleva la leyenda de
 * pendiente y la ventana del 3D. La ficha va arriba porque es lo que se busca
 * después de tocar; la leyenda es consulta de fondo y por eso viene plegada.
 */

/** Cuánto puede crecer la leyenda antes de hacerse desplazable. */
const ALTO_LEYENDA = "14rem"

/**
 * Una fila de la ficha: nombre del campo y su valor, con los enlaces vivos.
 *
 * El servicio de estado de la cartografía devuelve direcciones —la memoria
 * explicativa de una plancha, su publicación—, y como texto plano obligan a
 * copiarlas a mano. `linkPartsOf` decide qué trozo es una dirección; aquí solo
 * se pinta.
 */
const Atributo = ({ field, value }) => (
  <div className="flex items-baseline gap-2 py-[3px]">
    {/* El nombre del campo se parte en dos líneas antes que cortarse con puntos
        suspensivos: «Unidad geológica» se quedaba en «UNIDAD GEO…», que no dice
        cuál de los dos campos es. Y en el teléfono no hay ratón que pasar por
        encima para leer el `title`. */}
    <span
      className="w-[38%] shrink-0 break-words text-[10px] uppercase leading-tight tracking-wide text-slate-400"
      title={field}
    >
      {field}
    </span>
    <span className="min-w-0 flex-1 break-words text-[11px] leading-snug text-slate-700">
      {linkPartsOf(value).map((parte, i) =>
        parte.href ? (
          <a
            key={i}
            href={parte.href}
            target="_blank"
            // `noreferrer` además de `noopener`: la página que se abre no tiene
            // por qué saber desde dónde se llegó.
            rel="noopener noreferrer"
            title={parte.href}
            className="break-all font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-700 hover:decoration-blue-500"
          >
            {shortLinkText(parte.text)}
          </a>
        ) : (
          <span key={i}>{parte.text}</span>
        ),
      )}
    </span>
  </div>
)

/**
 * El botón que trae la plancha en PDF y la pone sobre el mapa.
 *
 * **Por qué está aquí y no en el panel de capas.** El enlace no es de una capa,
 * es de *esta* plancha: sale del `ECG_URL_PL` de la ficha que se acaba de
 * consultar, y hasta que alguien no toca una cuadrícula no existe. Ofrecerlo en
 * una lista de capas obligaría a preguntar antes «¿cuál plancha?», que es
 * exactamente lo que el clic sobre el mapa ya contestó.
 *
 * Sale solo si la ficha trae un PDF: una plancha sin cartografía publicada no
 * tiene ninguno, y un botón que no se puede pulsar informa peor que ningún botón.
 */
const PonerPlancha = ({ resultado, lngLat, onCargar, onDismiss }) => {
  const url = onCargar ? planchaPdfFrom(resultado.attributes) : null
  if (!url) return null

  return (
    <button
      type="button"
      onClick={() => {
        onCargar({
          url,
          titulo: [sgcLayerByKey(resultado.layerKey)?.label, resultado.value]
            .filter(Boolean)
            .join(" · "),
          cerca: lngLat,
        })
        onDismiss?.()
      }}
      className="mb-2 flex w-full items-center justify-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
    >
      <MapIcon className="h-3.5 w-3.5" />
      Poner la plancha sobre el mapa
    </button>
  )
}

export const SgcPanel = ({
  activeKeys,
  subLayers,
  chosenSub,
  legends,
  featureInfo,
  fieldInfo,
  onDismiss,
  onCargarPlancha,
}) => {
  const [leyendaAbierta, setLeyendaAbierta] = useState(false)

  // Cada consulta nueva llega con la leyenda plegada. Si se quedara abierta de
  // la consulta anterior, la respuesta —que es lo que se acaba de pedir— saldría
  // empujada fuera de la pantalla por doscientas filas de simbología.
  useEffect(() => {
    if (featureInfo?.loading) setLeyendaAbierta(false)
  }, [featureInfo?.loading])

  // Sin consulta no hay tarjeta: es un popup, no un panel fijo.
  if (!featureInfo) return null

  const resultados = featureInfo.results ?? []
  const consultando = Boolean(featureInfo.loading)

  /**
   * Qué leyendas se enseñan.
   *
   * Solo las de las subcapas elegidas cuando hay elección: con «Geología por
   * departamentos» y Antioquia marcada, la leyenda de los otros treinta y un
   * departamentos sería una lista de cientos de filas de las que ninguna está en
   * pantalla. Y sin nada marcado, ninguna: esa capa no está dibujando nada, así
   * que una leyenda ahí describiría algo que no se ve.
   */
  const leyendaVisible = activeKeys.flatMap((key) => {
    const elegidas = chosenSub?.[key] ?? []
    const tieneElección = (subLayers?.[key]?.length ?? 0) > 0
    return (legends?.[key] ?? [])
      .filter((capa) => !tieneElección || elegidas.includes(capa.layerId))
      .map((capa) => ({ ...capa, key }))
  })

  /**
   * La ficha se arrastra, y por eso va dentro de `FloatingPanel`.
   *
   * Salía siempre pegada al costado derecho, que es justo donde suele estar el
   * polígono que se acaba de tocar: para ver la unidad de al lado había que
   * cerrarla, mover el mapa y volver a tocar. Ahora se agarra por su barra y se
   * lleva a donde no estorbe, con el mapa quieto.
   *
   * Se reutiliza el panel del 3D y el de dibujo en vez de escribir otro arrastre:
   * ese componente ya tiene resueltas las tres trampas que costaron una tanda
   * cada una —el `preventDefault` que mataba el clic de la equis, distinguir un
   * arrastre de un toque, y devolver el panel a la pantalla si se sale o si la
   * ventana cambia de tamaño—.
   *
   * `collapsible={false}` porque esta ficha no debe dejar un botón detrás: se
   * abre tocando el mapa, así que la equis la cierra del todo, como antes.
   */
  return (
    <FloatingPanel
      title={consultando ? "Consultando…" : "En este punto"}
      icon={MapPin}
      collapsible={false}
      closeLabel="Cerrar la consulta"
      onRequestClose={onDismiss}
    >
      {/* El margen negativo anula el relleno del panel para que las separaciones
          y la barra de «Simbología» sigan llegando de borde a borde, como en la
          tarjeta que había antes. */}
      <div className="-mx-3 -my-2">
      {!consultando && resultados.length === 0 ? (
        // Decirlo, y no dejar la tarjeta vacía: «no hay dato aquí» y «la consulta
        // falló» se ven igual si no se distinguen, y la primera es una respuesta
        // legítima —hay huecos de cartografía—.
        <p className="px-2.5 py-2 text-[11px] leading-snug text-slate-500">
          No hay unidades cartografiadas en este punto para las capas encendidas.
        </p>
      ) : (
        <div className="max-h-[16rem] overflow-y-auto px-2.5 py-2">
          {resultados.map((resultado, i) => (
            <div key={`${resultado.layerKey}-${i}`} className={i > 0 ? "mt-2.5 border-t border-slate-100 pt-2" : ""}>
              <p className="text-[11px] font-medium leading-snug text-slate-800">
                {resultado.value || resultado.layerName}
              </p>
              <p className="mb-1 text-[10px] text-slate-400">
                {sgcLayerByKey(resultado.layerKey)?.label ?? resultado.layerKey}
                {resultado.layerName ? ` · ${resultado.layerName}` : ""}
              </p>
              {/* El botón va **antes** de los campos, no después. Es lo que se
                  viene a hacer con esta ficha; los quince atributos de abajo son
                  la letra pequeña, y al final del todo obligaban a desplazar la
                  tarjeta para encontrarlo. Pegado a su encabezado, además, se ve
                  de qué plancha es: con varias capas del SGC encendidas la ficha
                  trae un bloque por capa y antes había que adivinarlo. */}
              <PonerPlancha
                resultado={resultado}
                lngLat={featureInfo.lngLat}
                onCargar={onCargarPlancha}
                onDismiss={onDismiss}
              />
              {/* Los códigos, con su significado cuando el servicio lo publica:
                  «Qal» pasa a «Qal — Depósitos aluviales». Y el nombre del campo,
                  con el alias que el SGC le puso para enseñarlo. */}
              {resultado.attributes.map((atributo) => {
                const ficha = fieldInfo?.[`${resultado.layerKey}:${resultado.layerId}`]
                return (
                  <Atributo
                    key={atributo.field}
                    field={ficha?.aliases?.[atributo.field] ?? atributo.field}
                    value={describeValue(atributo.value, ficha?.meanings)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* La leyenda, plegada. */}
      <button
        type="button"
        onClick={() => setLeyendaAbierta((abierta) => !abierta)}
        aria-expanded={leyendaAbierta}
        className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
      >
        <span>Simbología</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
          {leyendaVisible.length === 0
            ? "sin datos"
            : leyendaVisible.length === 1
              ? "1 capa"
              : `${leyendaVisible.length} capas`}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${leyendaAbierta ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {leyendaAbierta && (
        <div className="overflow-y-auto border-t border-slate-100 px-2.5 py-2" style={{ maxHeight: ALTO_LEYENDA }}>
          {leyendaVisible.length === 0 ? (
            <p className="text-[11px] leading-snug text-slate-500">
              El servicio no devolvió simbología para lo que está encendido.
            </p>
          ) : (
            leyendaVisible.map((capa) => (
              <div key={`${capa.key}-${capa.layerId}`} className="mb-2 last:mb-0">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                  {capa.layerName}
                </p>
                {capa.items.map((item, i) => (
                  <div key={`${item.label}-${i}`} className="flex items-center gap-2 py-[2px]">
                    {/* El símbolo viene del propio servicio, ya dibujado: es el
                        mismo que está sobre el mapa, no una aproximación
                        nuestra.

                        Y va con `img` y no con el `Image` de Next: estos
                        símbolos llegan dentro del propio JSON de la leyenda,
                        como `data:` —no son archivos que se puedan pedir por
                        dirección—, así que no hay nada que Next pueda
                        optimizar. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt="" className="h-3.5 w-5 shrink-0 object-contain" />
                    <span className="flex-1 text-[11px] leading-tight text-slate-700">
                      {item.label || "sin nombre"}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
      </div>
    </FloatingPanel>
  )
}

/** Las claves de las capas del SGC encendidas, en el orden del catálogo. */
export const activeSgcKeys = (layerState) =>
  SGC_LAYERS.filter(({ key }) => layerState?.[key]?.on).map(({ key }) => key)
