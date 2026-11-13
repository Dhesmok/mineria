"use client"

import { AlertTriangle, ExternalLink, Layers, Loader2, Maximize2, Trash2 } from "lucide-react"

import { FloatingPanel } from "./FloatingPanel"
import { OpacitySlider } from "./OpacitySlider"

/**
 * El panel de la plancha geológica puesta sobre el mapa.
 *
 * Aparece al pedir una plancha y desaparece al quitarla. Lleva lo justo: en qué
 * va, con qué transparencia se ve, un botón para encuadrarla y otro para
 * quitarla.
 *
 * **Y dice qué tan bien quedó colocada**, que no es adorno. La hoja se
 * georreferencia sola, leyendo la cuadrícula que el propio PDF trae dibujada; eso
 * puede salir muy bien o regular según la hoja, y quien la va a usar para tomar
 * una decisión tiene derecho a saber con cuántos puntos de control se ajustó y
 * cuánto se desviaron. Un mapa colocado por un programa sin decir su margen de
 * error es un mapa en el que no se puede confiar ni desconfiar.
 */

/**
 * Cuánto se corrigió la hoja, dicho para leerlo, o `null` si no hizo falta.
 *
 * Casi siempre es `null`. Cuando no lo es, la hoja tenía sus rótulos abreviados
 * corridos respecto a los de las esquinas — ver `declaredShift` — y el aviso es
 * lo único que distingue un mapa colocado a conciencia de uno colocado a ojo.
 */
const corrida = (shift) => {
  const partes = []
  if (shift?.este) partes.push(`${Math.abs(shift.este) / 1000} km al ${shift.este > 0 ? "oeste" : "este"}`)
  if (shift?.norte) partes.push(`${Math.abs(shift.norte) / 1000} km al ${shift.norte > 0 ? "sur" : "norte"}`)
  return partes.length ? partes.join(" y ") : null
}

/**
 * En qué se fue el tiempo, dicho en segundos.
 *
 * `descarga` es la red y el resto es el navegador dibujando el PDF. Separarlos
 * es lo único que permite responder a «va lentísimo» sin tener el equipo
 * delante: si manda la descarga, el problema está en el SGC o en la conexión; si
 * manda el dibujado, está en el aparato.
 */
const tardanza = (tiempos) => {
  if (!tiempos) return null
  const partes = [
    ["descarga", tiempos.descarga],
    ["dibujado", (tiempos.medida ?? 0) + (tiempos.recorte ?? 0)],
    ["cuadrícula", tiempos.geo],
  ]
    .filter(([, ms]) => ms >= 100)
    .map(([que, ms]) => `${(ms / 1000).toFixed(1)} s ${que}`)
  return partes.length ? partes.join(" · ") : null
}

/** De píxeles de residuo a metros sobre el terreno, para poder contarlo. */
const metrosDeResiduo = (residual, size, canvas) => {
  const anchoPx = canvas?.width
  if (!anchoPx || !size?.[0]) return null
  // El residuo está medido en la pasada de medida y el ancho en la de dibujo;
  // los dos son proporcionales al mismo terreno, así que la regla de tres vale.
  return (residual * size[0]) / anchoPx
}

export const PlanchaPanel = ({
  plancha,
  opacity,
  onOpacity,
  onEncuadrar,
  onQuitar,
  onCancelar,
  onCambiarResolucion,
}) => {
  if (!plancha) return null

  const cargando = Boolean(plancha.cargando)
  const fallo = plancha.error

  return (
    <FloatingPanel
      title={plancha.titulo || "Plancha geológica"}
      icon={cargando ? Loader2 : Layers}
      collapsible={false}
      closeLabel="Quitar la plancha del mapa"
      onRequestClose={onCancelar ?? onQuitar}
    >
      {cargando && (
        <div className="space-y-2.5 py-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-foreground">
              {plancha.progreso?.detalle || "Procesando plancha geológica..."}
            </span>
            <span className="text-[10px] font-semibold tabular-nums text-primary">
              {plancha.progreso?.porcentaje ? `${plancha.progreso.porcentaje}%` : ""}
            </span>
          </div>

          {/* Barra de progreso animada */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-fill-strong ring-1 ring-border">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, Math.min(100, plancha.progreso?.porcentaje ?? 15))}%` }}
            />
          </div>

          {/* Etapas discretas del pipeline */}
          <div className="flex justify-between text-[9px] uppercase tracking-wider text-label-4">
            <span className={plancha.progreso?.porcentaje >= 10 ? "font-bold text-primary" : ""}>Descarga</span>
            <span className={plancha.progreso?.porcentaje >= 52 ? "font-bold text-primary" : ""}>Medida</span>
            <span className={plancha.progreso?.porcentaje >= 68 ? "font-bold text-primary" : ""}>Gauss</span>
            <span className={plancha.progreso?.porcentaje >= 82 ? "font-bold text-primary" : ""}>Recorte</span>
            <span className={plancha.progreso?.porcentaje >= 96 ? "font-bold text-primary" : ""}>Visor</span>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onCancelar ?? onQuitar}
              className="rounded border border-input bg-fill px-2.5 py-0.5 text-[10px] font-medium text-label-2 transition-colors hover:bg-fill-strong hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {fallo && (
        <div className="space-y-1 py-1">
          <div className="flex items-start gap-1.5 text-[11px] font-medium text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{fallo}</span>
          </div>
          {/* El número de la plancha, el tamaño del archivo o el residuo con el
              que falló: sin ellos es imposible depurar una hoja rota sin tener el
              archivo delante. */}
          {plancha.detalle && (
            <p className="pl-5 text-[10px] leading-snug text-label-3">{plancha.detalle}</p>
          )}
          {/* Que no se pueda colocar sobre el mapa no quita que el PDF sirva:
              sigue siendo la geología más actualizada de esa plancha. */}
          {plancha.url && (
            <a
              href={plancha.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir el PDF aparte
            </a>
          )}
        </div>
      )}

      {plancha.canvas && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-[52px] shrink-0 text-[10px] uppercase tracking-wide text-label-3">
              Opacidad
            </span>
            <OpacitySlider
              value={opacity}
              onChange={onOpacity}
              label="Opacidad de la plancha"
              className="min-w-0 flex-1"
            />
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-label-3">
              {Math.round((opacity ?? 1) * 100)}%
            </span>
          </div>

          {onCambiarResolucion && (
            <div className="flex items-center justify-between border-t border-border pt-2 text-[10px]">
              <span className="text-[10px] uppercase tracking-wide text-label-3">Calidad</span>
              <div className="flex gap-1">
                {[
                  { id: "baja", valor: 1800, etiqueta: "Baja (1.8k)" },
                  { id: "media", valor: 2500, etiqueta: "Media (2.5k)" },
                  { id: "alta", valor: 3000, etiqueta: "Alta (3k)" },
                ].map((opc) => {
                  const activa = (plancha.resolucion ?? 2500) === opc.valor
                  return (
                    <button
                      key={opc.id}
                      type="button"
                      onClick={() => onCambiarResolucion(opc.valor)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        activa
                          ? "bg-primary font-semibold text-white shadow-xs"
                          : "bg-fill-strong text-label-3 hover:bg-label-5/50 hover:text-foreground"
                      }`}
                    >
                      {opc.etiqueta}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <dl className="space-y-[3px] border-t border-border pt-2 text-[10px] leading-tight text-label-3">
            <Dato nombre="Origen" valor={plancha.crs?.label} />
            <Dato
              nombre="Hoja"
              valor={`${(plancha.size[0] / 1000).toFixed(1)} × ${(plancha.size[1] / 1000).toFixed(1)} km`}
            />
            <Dato
              nombre="Ajuste"
              valor={`${plancha.controlPoints} líneas de cuadrícula${
                metrosDeResiduo(plancha.residual, plancha.size, plancha.canvas)
                  ? `, ±${Math.round(metrosDeResiduo(plancha.residual, plancha.size, plancha.canvas))} m`
                  : ""
              }`}
            />
            {/* Cuánto tardó, y en qué. Las hojas son casi mil y pesan decenas de
                megas cada una: cuando una tarda de más, lo primero que hay que
                saber es si se fue el tiempo en la red o en dibujarla, porque son
                dos problemas distintos y ninguno se distingue del otro mirando
                la pantalla. */}
            <Dato nombre="Tardó" valor={tardanza(plancha.tiempos)} />
            {corrida(plancha.shift) && (
              // **Esto no se calla.** Significa que la hoja se contradice a sí
              // misma —sus rótulos abreviados dicen una cosa y los de las
              // esquinas otra— y que el visor ha hecho caso a los de esquina. Es
              // una decisión con consecuencias sobre dónde queda la geología, y
              // quien la vaya a usar tiene que poder ir a mirar el papel.
              <p className="pt-1 text-warning">
                Los rótulos abreviados de esta hoja van {corrida(plancha.shift)} corridos
                respecto a los de las esquinas. Se colocó con los de las esquinas.
              </p>
            )}
            {!plancha.frameComplete && (
              // Sin los cuatro bordes del marco el recorte se hizo por la última
              // línea de la cuadrícula, así que a la hoja le falta un borde. Se
              // dice, porque desde el mapa no hay forma de notarlo.
              <p className="pt-1 text-warning">
                No se encontraron los cuatro bordes del marco: puede faltarle una
                franja a la hoja.
              </p>
            )}
          </dl>

          <div className="flex gap-1.5 border-t border-border pt-2">
            <Boton onClick={onEncuadrar} icon={Maximize2}>
              Encuadrar
            </Boton>
            <Boton onClick={onQuitar} icon={Trash2}>
              Quitar
            </Boton>
          </div>
        </div>
      )}
    </FloatingPanel>
  )
}

const Dato = ({ nombre, valor }) =>
  valor ? (
    <div className="flex items-baseline gap-2">
      <dt className="w-[52px] shrink-0 uppercase tracking-wide text-label-4">{nombre}</dt>
      <dd className="min-w-0 flex-1 break-words text-label-2">{valor}</dd>
    </div>
  ) : null

const Boton = ({ onClick, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-fill-strong hover:bg-label-5/40 px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:text-foreground transition-colors shadow-sm"
  >
    <Icon className="h-3 w-3" />
    {children}
  </button>
)
