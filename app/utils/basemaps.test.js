import {
  ALL_BASEMAP_LAYERS,
  BASEMAPS,
  BASEMAP_SOURCES,
  DEFAULT_BASEMAP,
  basemapById,
  hasFixedLabels,
  supportsLabelToggle,
  visibleBasemapLayers,
} from "./basemaps"

describe("basemaps", () => {
  it("cada fondo declara capas para las dos formas", () => {
    // Salvo «Relieve», que es justamente no encender capas de satélite/callejero
    // para mostrar el sombreado sobre fondo neutro.
    BASEMAPS.filter((basemap) => basemap.id !== "relief").forEach((basemap) => {
      expect(basemap.withLabels.length).toBeGreaterThan(0)
      expect(basemap.withoutLabels.length).toBeGreaterThan(0)
    })
  })

  it("«Relieve» no enciende capas ráster externas", () => {
    // Para ver el sombreado del terreno sin imágenes que compitan
    expect(visibleBasemapLayers("relief", true)).toEqual([])
    expect(visibleBasemapLayers("relief", false)).toEqual([])
    expect(supportsLabelToggle("relief")).toBe(false)
  })

  it("«Relieve» tampoco tiene nombres fijos que anunciar", () => {
    expect(hasFixedLabels("relief")).toBe(false)
    expect(hasFixedLabels("osm")).toBe(true)
    expect(hasFixedLabels("topo")).toBe(true)
    expect(hasFixedLabels("positron")).toBe(false)
  })

  it("el id antiguo 'none' resuelve como alias a 'relief'", () => {
    expect(basemapById("none").id).toBe("relief")
  })

  it("todas las capas que nombra un fondo están en la lista general", () => {
    // Si una se quedara fuera, nadie la apagaría al cambiar de fondo y se vería
    // un satélite debajo de un topográfico.
    BASEMAPS.forEach((basemap) => {
      ;[...basemap.withLabels, ...basemap.withoutLabels].forEach((id) => {
        expect(ALL_BASEMAP_LAYERS).toContain(id)
      })
    })
  })

  it("los fondos con nombres pintados en la tesela no ofrecen quitarlos", () => {
    // Ofrecer un interruptor que no hace nada es peor que no ofrecerlo.
    expect(supportsLabelToggle("osm")).toBe(false)
    expect(supportsLabelToggle("topo")).toBe(false)
    expect(supportsLabelToggle("satellite")).toBe(true)
    expect(supportsLabelToggle("esri")).toBe(true)
    expect(supportsLabelToggle("positron")).toBe(true)
  })

  it("en esos fondos, las dos formas dan lo mismo", () => {
    expect(visibleBasemapLayers("topo", true)).toEqual(visibleBasemapLayers("topo", false))
    expect(visibleBasemapLayers("osm", true)).toEqual(visibleBasemapLayers("osm", false))
  })

  it("los dos fondos de Esri superponen los nombres", () => {
    // La imagen de satélite y el lienzo gris claro. El gris pasó a esta familia
    // al sustituir a CARTO: CARTO publicaba dos direcciones distintas —una con
    // nombres y otra sin— mientras que Esri publica los nombres aparte.
    for (const id of ["esri", "positron"]) {
      const con = visibleBasemapLayers(id, true)
      const sin = visibleBasemapLayers(id, false)
      expect(con).toHaveLength(2)
      expect(sin).toHaveLength(1)
      expect(con).toEqual(expect.arrayContaining(sin))
    }
  })

  it("Google cambia de dirección, no superpone", () => {
    const con = visibleBasemapLayers("satellite", true)
    const sin = visibleBasemapLayers("satellite", false)
    expect(con).toHaveLength(1)
    expect(sin).toHaveLength(1)
    expect(con[0]).not.toBe(sin[0])
  })

  it("ningún fondo depende ya de un servicio que pida clave", () => {
    // CARTO servía el gris claro sin pedir nada y de un día para otro empezó a
    // devolver las teselas atravesadas por un «API KEY REQUIRED». Como era el
    // fondo de partida, el visor abría con el mapa marcado de lado a lado.
    const direcciones = Object.values(BASEMAP_SOURCES).flatMap((s) => s.tiles)
    direcciones.forEach((url) => {
      expect(url).not.toMatch(/cartocdn/)
      expect(url).not.toMatch(/[?&](api_?key|access_token|key)=/i)
    })
  })

  it("un fondo desconocido cae en el de partida", () => {
    expect(basemapById("no-existe").id).toBe(DEFAULT_BASEMAP)
  })

  it("las fuentes traen maxzoom y atribución", () => {
    // Sin maxzoom, pasar del último nivel real deja el mapa en gris en vez de
    // estirar la última tesela. Y la atribución la exigen las licencias.
    Object.values(BASEMAP_SOURCES).forEach((source) => {
      expect(source.type).toBe("raster")
      expect(source.maxzoom).toBeGreaterThan(0)
      expect(source.attribution).toBeTruthy()
      expect(source.tiles.length).toBeGreaterThan(0)
    })
  })

  it("las teselas de ArcGIS van en orden z/y/x, que es al revés que las demás", () => {
    // Invertirlo no da error: da un mapa que no cuadra con nada.
    expect(BASEMAP_SOURCES["bm-esri-imagery-src"].tiles[0]).toContain("/tile/{z}/{y}/{x}")
    expect(BASEMAP_SOURCES["bm-esri-reference-src"].tiles[0]).toContain("/tile/{z}/{y}/{x}")
  })
})
