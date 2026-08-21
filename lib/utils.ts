import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Una función aplazada que además se puede cancelar. */
export interface Debounced<T extends (..._args: any[]) => any> {
  (..._args: Parameters<T>): void
  /**
   * Anula la llamada pendiente, si la hay.
   *
   * No es un adorno: quien crea la función aplazada suele recrearla cuando
   * cambian sus dependencias, y sin esto la cuenta atrás de la versión anterior
   * sigue en marcha y acaba ejecutando código de un render que ya no existe.
   */
  cancel: () => void
}

export function debounce<T extends (..._args: any[]) => any>(fn: T, delay: number): Debounced<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: Parameters<T>) => {
    if (timeout !== undefined) clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }

  debounced.cancel = () => {
    if (timeout !== undefined) clearTimeout(timeout)
    timeout = undefined
  }

  return debounced
}
