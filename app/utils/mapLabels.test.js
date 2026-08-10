import { createLabelMarker, shouldShowLabels, syncLabelsWithFeatures } from "./mapLabels"

const SQUARE = [
  [
    [-75.6, 6.2],
    [-75.57, 6.2],
    [-75.57, 6.23],
    [-75.6, 6.23],
    [-75.6, 6.2],
  ],
]

const feature = (properties, id = 1) => ({
  id,
  type: "Feature",
  properties,
  geometry: { type: "Polygon", coordinates: SQUARE },
})

describe("shouldShowLabels", () => {
  it("oculta las etiquetas por debajo del zoom mínimo", () => {
    expect(shouldShowLabels(14)).toBe(false)
    expect(shouldShowLabels(15)).toBe(true)
  })

  it("las mantiene visibles por encima de z19", () => {
    // Regresión: el rango era 15..19, así que en satélite (z22) desaparecían al
    // acercarse más de la cuenta.
    expect(shouldShowLabels(20)).toBe(true)
    expect(shouldShowLabels(22)).toBe(true)
  })
})

describe("createLabelMarker", () => {
  it("crea el marcador con el código del expediente", () => {
    const marker = createLabelMarker(feature({ TENURE_ID: "ABC-123" }))

    expect(marker).not.toBeNull()
    expect(marker.options.icon.options.html).toContain("ABC-123")
  })

  it("escapa el HTML del código", () => {
    const marker = createLabelMarker(feature({ TENURE_ID: '<img src=x onerror=alert(1)>' }))

    expect(marker.options.icon.options.html).not.toContain("<img")
    expect(marker.options.icon.options.html).toContain("&lt;img")
  })

  it("devuelve null cuando la geometría no permite ubicar la etiqueta", () => {
    expect(createLabelMarker({ id: 1, properties: {}, geometry: null })).toBeNull()
  })
})

describe("syncLabelsWithFeatures", () => {
  const createFeatureLayer = () => {
    const handlers = {}
    return {
      on: (event, handler) => {
        handlers[event] = handler
      },
      fire: (event, payload) => handlers[event]?.(payload),
    }
  }

  const createLabelsGroup = () => {
    const layers = new Set()
    return {
      current: {
        addLayer: (l) => layers.add(l),
        removeLayer: (l) => layers.delete(l),
        size: () => layers.size,
      },
    }
  }

  it("quita la etiqueta cuando su polígono sale del viewport", () => {
    // Regresión: esri-leaflet retira los polígonos fuera de vista, pero las etiquetas
    // vivían en un grupo aparte y se acumulaban indefinidamente al navegar.
    const featureLayer = createFeatureLayer()
    const labelsLayerRef = createLabelsGroup()
    const markers = new Map()

    syncLabelsWithFeatures(featureLayer, labelsLayerRef, markers)

    const marker = { id: "marcador" }
    markers.set(7, marker)
    labelsLayerRef.current.addLayer(marker)
    expect(labelsLayerRef.current.size()).toBe(1)

    featureLayer.fire("removefeature", { feature: { id: 7 }, permanent: false })
    expect(labelsLayerRef.current.size()).toBe(0)
    expect(markers.has(7)).toBe(true)
  })

  it("repone la etiqueta cuando el polígono vuelve a entrar", () => {
    const featureLayer = createFeatureLayer()
    const labelsLayerRef = createLabelsGroup()
    const markers = new Map([[7, { id: "marcador" }]])

    syncLabelsWithFeatures(featureLayer, labelsLayerRef, markers)

    featureLayer.fire("addfeature", { feature: { id: 7 } })
    expect(labelsLayerRef.current.size()).toBe(1)
  })

  it("olvida el marcador cuando esri-leaflet descarta la feature", () => {
    const featureLayer = createFeatureLayer()
    const labelsLayerRef = createLabelsGroup()
    const markers = new Map([[7, { id: "marcador" }]])

    syncLabelsWithFeatures(featureLayer, labelsLayerRef, markers)

    featureLayer.fire("removefeature", { feature: { id: 7 }, permanent: true })
    expect(markers.has(7)).toBe(false)
  })

  it("tolera eventos de features sin etiqueta", () => {
    const featureLayer = createFeatureLayer()
    const labelsLayerRef = createLabelsGroup()

    syncLabelsWithFeatures(featureLayer, labelsLayerRef, new Map())

    expect(() => featureLayer.fire("removefeature", { feature: { id: 99 } })).not.toThrow()
    expect(() => featureLayer.fire("addfeature", {})).not.toThrow()
  })
})
