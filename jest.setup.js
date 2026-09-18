require('@testing-library/jest-dom')

// jsdom no trae `TextEncoder` ni `TextDecoder`, que en un navegador son globales
// desde hace años. Los usa la lectura de archivos del usuario —hay que decidir si
// un DXF viene en UTF-8 o en la codificación de Windows, ver `decodeText` en
// `utils/fileImport.js`— y sin esto las pruebas de ese módulo fallan con un
// «TextEncoder is not defined» que no tiene nada que ver con lo que se prueba.
// Son los de Node, que implementan el mismo estándar.
const { TextDecoder, TextEncoder } = require('node:util')
global.TextEncoder = global.TextEncoder ?? TextEncoder
global.TextDecoder = global.TextDecoder ?? TextDecoder

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
