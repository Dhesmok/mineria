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

/** De píxeles de residuo a metros sobre el terreno, para poder contarlo. */
const metrosDeResiduo = (residual, size, canvas) => {
  const anchoPx = canvas?.width
  if (!anchoPx || !size?.[0]) return null
  // El residuo está medido en la pasada de medida y el ancho en la de dibujo;
  // los dos son proporcionales al mismo terreno, así que la regla de tres vale.
  return (residual * size[0]) / anchoPx
}

export const PlanchaPanel = ({ plancha, opacity, onOpacity, onEncuadrar, onQuitar }) => {
  if (!plancha) return null

  const cargando = Boolean(plancha.cargando)
  const fallo = plancha.error

  return (
    <FloatingPanel
      title={plancha.titulo || "Plancha geológica"}
      icon={cargando ? Loader2 : Layers}
      collapsible={false}
      closeLabel="Quitar la plancha del mapa"
      onRequestClose={onQuitar}
    >
      {cargando && (
        <p className="text-[11px] leading-snug text-slate-500">
          Trayendo el PDF del SGC y buscándole la cuadrícula. Una plancha pesa
          decenas de megas: puede tardar.
        </p>
      )}

      {fallo && (
        <div className="space-y-2">
          <p className="flex gap-1.5 text-[11px] leading-snug text-amber-700">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>{fallo}</span>
          </p>
          {/* Que no se pueda colocar sobre el mapa no quita que el PDF sirva:
              sigue siendo la geología más actualizada de esa plancha. */}
          {plancha.url && (
            <a
              href={plancha.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700"
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
            <span className="w-[52px] shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
              Opacidad
            </span>
            <OpacitySlider
              value={opacity}
              onChange={onOpacity}
              label="Opacidad de la plancha"
              className="min-w-0 flex-1"
            />
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
              {Math.round((opacity ?? 1) * 100)}%
            </span>
          </div>

          <dl className="space-y-[3px] border-t border-slate-100 pt-2 text-[10px] leading-tight text-slate-500">
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
            {!plancha.frameComplete && (
              // Sin los cuatro bordes del marco el recorte se hizo por la última
              // línea de la cuadrícula, así que a la hoja le falta un borde. Se
              // dice, porque desde el mapa no hay forma de notarlo.
              <p className="pt-1 text-amber-700">
                No se encontraron los cuatro bordes del marco: puede faltarle una
                franja a la hoja.
              </p>
            )}
          </dl>

          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
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
      <dt className="w-[52px] shrink-0 uppercase tracking-wide text-slate-400">{nombre}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-600">{valor}</dd>
    </div>
  ) : null

const Boton = ({ onClick, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
  >
    <Icon className="h-3 w-3" />
    {children}
  </button>
)
