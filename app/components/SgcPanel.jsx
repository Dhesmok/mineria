"use client"

import { useState } from "react"
import { ChevronDown, X } from "lucide-react"

import { SGC_LAYERS, sgcLayerByKey } from "../utils/sgcLayers"

/**
 * Lo que hace legible un mapa geológico: la leyenda y la ficha del punto.
 *
 * **Por qué existe.** Las capas del SGC llegan dibujadas, con su simbología. Eso
 * es lo correcto —el color *es* el dato— pero solo hasta cierto punto: sin
 * leyenda son manchas bonitas, y sin poder preguntarle a una mancha qué unidad
 * es, no se puede trabajar con ellas. Un visor que enseña geología y no deja
 * consultarla no sirve para lo que se abre.
 *
 * **Una sola tarjeta y no dos**, con las dos cosas dentro. Son dos preguntas del
 * mismo tipo —«qué significa esto que veo»— y separarlas en dos ventanas
 * flotantes habría llenado la columna derecha, que ya lleva la leyenda de
 * pendiente y la ventana del 3D.
 *
 * **La ficha va arriba y la leyenda abajo.** El orden es el de la atención:
 * después de tocar el mapa, lo que se busca es la respuesta; la leyenda es
 * consulta de fondo y por eso viene plegada.
 */

/** Cuánto puede crecer la leyenda antes de hacerse desplazable. */
const ALTO_LEYENDA = "14rem"

/** Una fila de la ficha: nombre del campo y su valor. */
const Atributo = ({ field, value }) => (
  <div className="flex items-baseline gap-2 py-[3px]">
    <span className="w-[38%] shrink-0 truncate text-[10px] uppercase tracking-wide text-slate-400" title={field}>
      {field}
    </span>
    <span className="flex-1 text-[11px] leading-snug text-slate-700">{value}</span>
  </div>
)

export const SgcPanel = ({ activeKeys, subLayers, chosenSub, legends, featureInfo, onDismiss }) => {
  const [leyendaAbierta, setLeyendaAbierta] = useState(false)

  if (activeKeys.length === 0) return null

  const resultados = featureInfo?.results ?? []
  const consultando = Boolean(featureInfo?.loading)

  /**
   * Qué leyendas se enseñan.
   *
   * Solo las de las subcapas elegidas cuando hay elección: con «Geología por
   * departamentos» y Antioquia marcada, la leyenda de los otros treinta y un
   * departamentos sería una lista de doscientas filas de las que ninguna está en
   * pantalla.
   *
   * Sin nada marcado no se filtra, porque entonces el servicio dibuja lo que
   * trae de fábrica y la leyenda completa es lo único que se corresponde con eso.
   */
  const leyendaVisible = activeKeys.flatMap((key) => {
    const elegidas = chosenSub?.[key] ?? []
    const tieneElección = (subLayers?.[key]?.length ?? 0) > 0
    return (legends?.[key] ?? [])
      .filter((capa) => !tieneElección || elegidas.length === 0 || elegidas.includes(capa.layerId))
      .map((capa) => ({ ...capa, key }))
  })

  return (
    <div className="w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <p className="flex items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
        <span>Geología</span>
        <span className="shrink-0 text-[10px] font-normal text-slate-400">SGC</span>
      </p>

      {/* La ficha del punto tocado. */}
      {featureInfo ? (
        <div className="border-b border-slate-100">
          <div className="flex items-baseline justify-between gap-2 px-2.5 pt-2">
            <span className="text-[11px] font-medium text-slate-700">
              {consultando ? "Consultando…" : "En este punto"}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Cerrar la consulta"
              className="-mr-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!consultando && resultados.length === 0 ? (
            // Decirlo, y no dejar la tarjeta vacía: «no hay dato aquí» y «la
            // consulta falló» se ven igual si no se distinguen, y la primera es
            // una respuesta legítima —hay huecos de cartografía—.
            <p className="px-2.5 pb-2 pt-1 text-[11px] leading-snug text-slate-500">
              No hay unidades cartografiadas en este punto para las capas encendidas.
            </p>
          ) : (
            <div className="max-h-[16rem] overflow-y-auto px-2.5 pb-2 pt-1">
              {resultados.map((resultado, i) => (
                <div key={`${resultado.layerKey}-${i}`} className={i > 0 ? "mt-2.5 border-t border-slate-100 pt-2" : ""}>
                  <p className="text-[11px] font-medium leading-snug text-slate-800">
                    {resultado.value || resultado.layerName}
                  </p>
                  <p className="mb-1 text-[10px] text-slate-400">
                    {sgcLayerByKey(resultado.layerKey)?.label ?? resultado.layerKey}
                    {resultado.layerName ? ` · ${resultado.layerName}` : ""}
                  </p>
                  {resultado.attributes.map((atributo) => (
                    <Atributo key={atributo.field} {...atributo} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="border-b border-slate-100 px-2.5 py-2 text-[11px] leading-snug text-slate-500">
          Toca el mapa para ver qué unidad geológica hay en un punto.
        </p>
      )}

      {/* La leyenda, plegada. */}
      <button
        type="button"
        onClick={() => setLeyendaAbierta((abierta) => !abierta)}
        aria-expanded={leyendaAbierta}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
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
  )
}

/** Las claves de las capas del SGC encendidas, en el orden del catálogo. */
export const activeSgcKeys = (layerState) =>
  SGC_LAYERS.filter(({ key }) => layerState?.[key]?.on).map(({ key }) => key)
