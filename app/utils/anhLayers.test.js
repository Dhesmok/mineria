import {
  ANH_ATTRIBUTION,
  ANH_KEYS,
  ANH_LAYERS,
  anhExportUrl,
  anhIdentifyUrl,
  anhImageSize,
  anhImageUrl,
  anhLayerByKey,
  anhLayerId,
  anhLegendUrl,
  anhMetaUrl,
  anhSourceId,
} from "./anhLayers"

describe("el catálogo de la ANH", () => {
  it("trae las 7 capas de hidrocarburos, sin repetir clave", () => {
    expect(ANH_LAYERS).toHaveLength(7)
    expect(new Set(ANH_KEYS).size).toBe(7)
  })

  it("los nombres caben en la fila del panel (<= 25 caracteres)", () => {
    ANH_LAYERS.forEach(({ label }) => expect(label.length).toBeLessThanOrEqual(25))
  })

  it("todas apuntan al servidor oficial de la ANH y terminan en MapServer", () => {
    ANH_LAYERS.forEach(({ service }) => {
      expect(service).toMatch(/^https:\/\/geovisor\.anh\.gov\.co\//)
      expect(service).toMatch(/\/MapServer$/)
    })
  })

  it("cada una trae label, hint y scale", () => {
    ANH_LAYERS.forEach((capa) => {
      expect(capa.label).toBeTruthy()
      expect(capa.hint).toBeTruthy()
      expect(capa.scale).toBeTruthy()
    })
  })

  it("anhLayerByKey devuelve la capa correcta o undefined", () => {
    expect(anhLayerByKey("tierras").label).toBe("Mapa de Tierras ANH")
    expect(anhLayerByKey("no-existe")).toBeUndefined()
  })

  it("anhSourceId y anhLayerId generan prefijos únicos", () => {
    expect(anhSourceId("tierras")).toBe("anh-src-tierras")
    expect(anhLayerId("tierras")).toBe("anh-tierras")
  })

  it("anhExportUrl incluye bboxSR=4686 e imageSR=4686", () => {
    const url = anhExportUrl("https://geovisor.anh.gov.co/test", "-75,4,-73,5", "800,600")
    expect(url).toContain("bboxSR=4686")
    expect(url).toContain("imageSR=4686")
    expect(url).toContain("bbox=-75,4,-73,5")
  })

  it("anhImageSize calcula dimensiones proporcionadas", () => {
    const [w, h] = anhImageSize([-75, 4, -73, 6], [800, 800])
    expect(w).toBe(800)
    expect(h).toBe(800)
  })

  it("anhImageUrl arma la URL hacia /api/anh", () => {
    const url = anhImageUrl({ key: "tierras", bbox: [-75, 4, -73, 5], width: 800, height: 600 })
    expect(url).toContain("/api/anh?capa=tierras")
    expect(url).toContain("tam=800,600")
  })

  it("anhMetaUrl y anhLegendUrl arman rutas correctas", () => {
    expect(anhMetaUrl("tierras")).toBe("/api/anh?capa=tierras&modo=meta")
    expect(anhLegendUrl("tierras")).toBe("/api/anh?capa=tierras&modo=leyenda")
  })

  it("anhIdentifyUrl arma ruta con sr=4686", () => {
    const url = anhIdentifyUrl({
      key: "tierras",
      lngLat: { lng: -74.1, lat: 4.6 },
      bbox: [-75, 4, -73, 5],
      size: [800, 600],
    })
    expect(url).toContain("/api/anh?capa=tierras&modo=identify")
    expect(url).toContain("geom=-74.100000,4.600000")
  })

  it("la atribución menciona a la Agencia Nacional de Hidrocarburos", () => {
    expect(ANH_ATTRIBUTION).toContain("Agencia Nacional de Hidrocarburos")
    expect(ANH_ATTRIBUTION).toContain("anh.gov.co")
  })
})
