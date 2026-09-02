"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Una barra de opacidad.
 *
 * **Por qué no es un `input` a secas, que es lo que era.** Al arrastrarla rápido
 * y soltar el ratón *fuera* de la barra, el valor que quedaba no era el elegido:
 * la capa podía verse a media transparencia con la barra puesta del todo a la
 * derecha, o no verse.
 *
 * La causa es de las que solo se dan cuando algo va lento. Es un control
 * gobernado por React: lo que se ve es el valor del estado, no el del navegador.
 * Cada movimiento manda un valor nuevo, y mientras React reconstruye la lista y
 * MapLibre repinta —con el mapa cargado, eso son milisegundos de sobra— llegan
 * más movimientos. Si el último cae en ese hueco y encima el ratón se suelta
 * fuera, ese valor se pierde y en pantalla queda el penúltimo.
 *
 * El arreglo son dos cosas. Mientras se arrastra manda el navegador —el valor se
 * guarda aquí al lado y la barra deja de esperar a nadie—, y al soltar se lee del
 * propio elemento el valor final y se manda. Y el «soltar» se escucha **en toda
 * la ventana**, que es lo que arregla el caso de soltar fuera: el `pointerup` de
 * un elemento no se dispara si el dedo ya no está encima, pero el del documento
 * sí.
 *
 * **Vive aquí y no dentro del panel de capas** porque hay más de un sitio que
 * necesita una barra de opacidad —las capas de la ANM, las del SGC y la plancha
 * en PDF— y este componente tiene resueltas tres trampas que se volverían a pisar
 * copiándolo. Ya pasó con el píxel transparente, que estaba escrito dos veces con
 * el mismo error en las dos.
 *
 * @param {number} value opacidad de 0 a 1
 * @param {(valor:number)=>void} onChange recibe de 0 a 1
 */
export const OpacitySlider = ({ value, onChange, label, className = "" }) => {
  // `null` significa «no se está arrastrando»: entonces manda el valor de fuera.
  const [arrastrando, setArrastrando] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (arrastrando === null) return

    const soltar = () => {
      const valor = Number(inputRef.current?.value)
      setArrastrando(null)
      if (Number.isFinite(valor)) onChange(valor / 100)
    }

    // `pointercancel` también: en el móvil, un gesto que el navegador decide
    // convertir en desplazamiento cancela el puntero sin soltarlo, y sin esto la
    // barra se quedaba creyendo que seguía arrastrándose.
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [arrastrando, onChange])

  const actual = arrastrando ?? Math.round((value ?? 1) * 100)

  return (
    <input
      ref={inputRef}
      type="range"
      min="0"
      max="100"
      value={actual}
      onPointerDown={() => setArrastrando(Math.round((value ?? 1) * 100))}
      onChange={(event) => {
        const nuevo = Number(event.target.value)
        // Se guarda aquí *y* se manda fuera: aquí para que la barra siga al dedo
        // sin esperar, y fuera para que el mapa cambie mientras se arrastra, que
        // es como se elige una transparencia.
        if (arrastrando !== null) setArrastrando(nuevo)
        onChange(nuevo / 100)
      }}
      aria-label={label}
      className={`panel-opacidad ${className}`}
    />
  )
}
