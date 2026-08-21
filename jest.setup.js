require('@testing-library/jest-dom')

// El visor recuerda preferencias en el almacenamiento del navegador, y en las
// pruebas ese almacenamiento se comparte entre casos del mismo archivo: sin
// esto, una prueba que enciende una capa deja esa capa encendida para la
// siguiente, y el fallo aparece en un caso que no tiene nada que ver.
beforeEach(() => {
  try {
    window.localStorage.clear()
  } catch {
    // Suites que corren sin entorno de navegador.
  }
})
