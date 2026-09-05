"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import {
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Camera,
  Sun,
  Grid3X3,
  Play,
  Pause,
  Square,
  Compass,
  MapPin,
  Palette,
  Trash2,
  Check,
} from "lucide-react"

import { loadMosaic } from "../utils/demTileLoader"
import { tileRangeFor, tilesOf, DEM_MAX_ZOOM, TILE_SIZE } from "../utils/demTiles"
import { TERRAIN_TILE_TEMPLATE } from "../utils/mapStyles"

/**
 * Textura de tierra homogénea natural estilo corte de suelo / maqueta física
 * (tonos cálidos terrosos naturales, inspirados en tierra fértil compacta).
 */
function createHomogeneousEarthTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // 1. Degradado base de tierra natural cálida
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, "#5a3d28")   // Capa superior orgánica (humus)
  grad.addColorStop(0.12, "#7a5336") // Suelo fértil cálido
  grad.addColorStop(0.5, "#885f40")  // Estrato de tierra franca / arcillosa
  grad.addColorStop(0.85, "#6d472c") // Subsuelo denso
  grad.addColorStop(1, "#52331c")    // Base profunda
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // 2. Gránulos minerales y motas de suelo natural (efecto tierra compacta)
  for (let i = 0; i < 4500; i++) {
    const px = Math.random() * 512
    const py = Math.random() * 512
    const sz = 0.9 + Math.random() * 2.2
    const rnd = Math.random()
    if (rnd < 0.4) {
      ctx.fillStyle = "rgba(45, 26, 12, 0.28)" // Mota de humus oscuro
    } else if (rnd < 0.75) {
      ctx.fillStyle = "rgba(168, 122, 85, 0.25)" // Partícula arcillosa clara
    } else {
      ctx.fillStyle = "rgba(235, 205, 175, 0.18)" // Mota mineral / cuarzo
    }
    ctx.fillRect(px, py, sz, sz)
  }

  // 3. Finas micro-láminas horizontales orgánicas
  for (let y = 0; y < 512; y += 12) {
    const alpha = 0.03 + Math.random() * 0.04
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
    ctx.fillRect(0, y, 512, 1.5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/**
 * Textura topográfica por defecto en caso de no haber captura disponible
 */
function createFallbackTerrainTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const grad = ctx.createLinearGradient(0, 1024, 0, 0)
  grad.addColorStop(0, "#4a5d3e")
  grad.addColorStop(0.5, "#6b6255")
  grad.addColorStop(1, "#8c8275")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 1024)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/**
 * Muestreo bilineal preciso sobre el mosaico de alturas para preservar
 * la fidelidad de 30 metros del SRTM sin escalones artificiales.
 */
function sampleMosaicBilinear(lng, lat, heights, range) {
  const nTiles = 2 ** range.zoom
  const mercX = ((lng + 180) / 360) * nTiles
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const mercY =
    ((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2) * nTiles

  const colF = (mercX - range.minX) * TILE_SIZE
  const rowF = (mercY - range.minY) * TILE_SIZE

  const c0 = Math.floor(colF)
  const r0 = Math.floor(rowF)
  const fx = colF - c0
  const fy = rowF - r0

  const getH = (c, r) => {
    const cc = Math.max(0, Math.min(range.cols - 1, c))
    const rr = Math.max(0, Math.min(range.rows - 1, r))
    const v = heights[rr * range.cols + cc]
    return Number.isFinite(v) && v > -500 && v < 9000 ? v : null
  }

  const h00 = getH(c0, r0)
  const h10 = getH(c0 + 1, r0) ?? h00
  const h01 = getH(c0, r0 + 1) ?? h00
  const h11 = getH(c0 + 1, r0 + 1) ?? h00

  if (h00 === null) return null
  return (1 - fx) * (1 - fy) * h00 + fx * (1 - fy) * h10 + (1 - fx) * fy * h01 + fx * fy * h11
}

/**
 * Descarga y compone directamente las teselas de satélite a resolución nativa
 * para el recuadro especificado, sin tocar el mapa principal de MapLibre.
 */
async function loadHighResSatelliteTexture(bbox, basemap = "satellite") {
  if (typeof document === "undefined" || !bbox) return null
  const [minLng, minLat, maxLng, maxLat] = bbox

  const dLng = Math.abs(maxLng - minLng)
  const dLat = Math.abs(maxLat - minLat)
  const maxSpan = Math.max(dLng, dLat)
  let zoom = 15
  if (maxSpan > 0.25) zoom = 13
  else if (maxSpan > 0.1) zoom = 14
  else if (maxSpan < 0.035) zoom = 16

  const nTiles = 2 ** zoom
  const lng2tile = (lon) => Math.floor(((lon + 180) / 360) * nTiles)
  const lat2tile = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180)
    const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
    return Math.floor(((1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2) * nTiles)
  }

  const minX = lng2tile(minLng)
  const maxX = lng2tile(maxLng)
  const minY = lat2tile(maxLat)
  const maxY = lat2tile(minLat)

  const tilesX = Math.max(1, maxX - minX + 1)
  const tilesY = Math.max(1, maxY - minY + 1)

  // Plantilla de URL según mapa base
  const getTileUrl = (x, y, z) => {
    if (basemap === "osm") {
      return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
    }
    if (basemap === "topo") {
      return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`
    }
    if (basemap === "esri" || basemap === "esriImagery") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    }
    // Google Satellite por defecto
    const s = Math.abs((x + y) % 4)
    return `https://mt${s}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
  }

  const TILE_PX = 256
  const canvasW = tilesX * TILE_PX
  const canvasH = tilesY * TILE_PX

  const fullCanvas = document.createElement("canvas")
  fullCanvas.width = canvasW
  fullCanvas.height = canvasH
  const fullCtx = fullCanvas.getContext("2d")
  if (!fullCtx) return null

  const tilePromises = []
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileX = minX + tx
      const tileY = minY + ty
      const url = getTileUrl(tileX, tileY, zoom)

      const p = new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          fullCtx.drawImage(img, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX)
          resolve(true)
        }
        img.onerror = () => resolve(false)
        img.src = url
      })
      tilePromises.push(p)
    }
  }

  await Promise.all(tilePromises)

  // Recorte georreferenciado exacto del bbox dentro del mosaico
  const tile2lng = (x) => (x / nTiles) * 360 - 180
  const tile2lat = (y) => {
    const n = Math.PI - (2 * Math.PI * y) / nTiles
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  }

  const mosaicWest = tile2lng(minX)
  const mosaicEast = tile2lng(maxX + 1)
  const mosaicNorth = tile2lat(minY)
  const mosaicSouth = tile2lat(maxY + 1)

  const cropX = Math.max(0, ((minLng - mosaicWest) / (mosaicEast - mosaicWest)) * canvasW)
  const cropW = Math.min(canvasW - cropX, ((maxLng - minLng) / (mosaicEast - mosaicWest)) * canvasW)

  const lat2normY = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180)
    const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
    return (1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2
  }
  const mNorthY = lat2normY(mosaicNorth)
  const mSouthY = lat2normY(mosaicSouth)
  const bNorthY = lat2normY(maxLat)
  const bSouthY = lat2normY(minLat)

  const cropY = Math.max(0, ((bNorthY - mNorthY) / (mSouthY - mNorthY)) * canvasH)
  const cropH = Math.min(canvasH - cropY, ((bSouthY - bNorthY) / (mSouthY - mNorthY)) * canvasH)

  if (cropW <= 0 || cropH <= 0) return null

  const finalCanvas = document.createElement("canvas")
  finalCanvas.width = 2048
  finalCanvas.height = 2048
  const finalCtx = finalCanvas.getContext("2d")
  if (!finalCtx) return null

  finalCtx.imageSmoothingEnabled = true
  finalCtx.imageSmoothingQuality = "high"
  finalCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, 2048, 2048)

  return finalCanvas.toDataURL("image/jpeg", 0.95)
}

/**
 * Muestreo de cota en un punto a partir de la función elevationAt o MapLibre
 */
function sampleElevation(lng, lat, elevationAt, map) {
  if (typeof elevationAt === "function") {
    try {
      const e = elevationAt({ lng, lat })
      if (typeof e === "number" && !isNaN(e) && e > -500 && e < 9000) {
        return e
      }
    } catch {
      // continuar
    }
  }

  if (map?.queryTerrainElevation) {
    try {
      const e = map.queryTerrainElevation([lng, lat])
      if (typeof e === "number" && !isNaN(e)) {
        return e
      }
    } catch {
      // continuar
    }
  }

  return 1800
}

/**
 * Crea la etiqueta 2D del Pin (Tag micro-proporcionado, nítido y estilizado)
 */
function createPinSprite(text, color = "#10b981") {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 140
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Sombra suave proyectada debajo de la cápsula
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)"
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 6

  // Fondo cápsula redondeada blanca moderna
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(16, 16, 480, 100, 28)
  else ctx.rect(16, 16, 480, 100)
  ctx.fill()

  // Borde sutil
  ctx.shadowColor = "transparent"
  ctx.lineWidth = 3.5
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)"
  ctx.stroke()

  // Punto indicador de color a la izquierda
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(58, 66, 16, 0, Math.PI * 2)
  ctx.fill()

  // Texto nítido de alta legibilidad
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(text.slice(0, 18), 90, 68)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(spriteMat)
  // Escala delicada y proporcional (no invasiva sobre el terreno)
  sprite.scale.set(0.48, 0.13, 1)
  return sprite
}

/**
 * Crea el objeto 3D de un Pin estilizado (micro-aguja fina + bolita en tierra + etiqueta mini)
 */
function buildPinMesh(pin) {
  const group = new THREE.Group()
  group.name = "pin_" + pin.id
  group.userData = { pinId: pin.id }

  // 1. Bolita de contacto precisa en el suelo
  const dotGeom = new THREE.SphereGeometry(0.018, 12, 12)
  const dotMat = new THREE.MeshStandardMaterial({
    color: pin.color || 0x10b981,
    metalness: 0.85,
    roughness: 0.2,
    emissive: pin.color || 0x10b981,
    emissiveIntensity: 0.25,
  })
  const dot = new THREE.Mesh(dotGeom, dotMat)
  dot.position.y = 0.012
  group.add(dot)

  // 2. Mástil / aguja metálica fina plateada (proporcional y esbelta)
  const needleHeight = 0.35
  const needleGeom = new THREE.CylinderGeometry(0.007, 0.007, needleHeight, 8)
  const needleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.95,
    roughness: 0.15,
  })
  const needle = new THREE.Mesh(needleGeom, needleMat)
  needle.position.y = needleHeight / 2
  group.add(needle)

  // 3. Etiqueta / Sprite proporcionada
  const sprite = createPinSprite(pin.text, pin.color || "#10b981")
  if (sprite) {
    sprite.position.y = needleHeight + 0.09
    group.add(sprite)
  }

  group.position.set(pin.x, pin.y, pin.z)
  return group
}

/**
 * Componente de Bloque 3D del Terreno (Fidelidad Maqueta Diorama Física)
 */
export default function BlockModel3D({
  isOpen,
  onClose,
  rectangle,
  elevationAt,
  map,
  basemap = "satellite",
  onRedrawRectangle,
  isMaximized,
  onToggleMaximize,
}) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const blockGroupRef = useRef(null)
  const topMeshRef = useRef(null)
  const wallsMeshRef = useRef(null)
  const floorMeshRef = useRef(null)
  const sunLightRef = useRef(null)
  const hemiLightRef = useRef(null)
  const animFrameRef = useRef(null)
  const pinsGroupRef = useRef(null)

  // Datos de elevación en memoria
  const elevationGridRef = useRef([])
  const elevationMinRef = useRef(0)
  const elevationMaxRef = useRef(100)

  // Estados interactivos
  const [exaggeration, setExaggeration] = useState(1.0)
  const [sunPreset, setSunPreset] = useState("noon")
  const [sunAngle, setSunAngle] = useState(45)
  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  const [wireframe, setWireframe] = useState(false)
  const [studioTheme, setStudioTheme] = useState("dark") // Por defecto oscuro
  const [demLoaded, setDemLoaded] = useState(false)

  // Sistema interactivo de Pines personalizados
  const [pins, setPins] = useState([])
  const [isAddingPin, setIsAddingPin] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState(null)
  const [editingPinText, setEditingPinText] = useState("")

  // Medidas del rectángulo para escala métrica rigurosa
  const bbox = rectangle?.bbox || [-75.6, 6.2, -75.5, 6.3]
  const [minLng, minLat, maxLng, maxLat] = bbox

  const midLat = (minLat + maxLat) / 2
  const latMeters = (maxLat - minLat) * 111320
  const lngMeters = (maxLng - minLng) * 111320 * Math.cos((midLat * Math.PI) / 180)

  const aspect = Math.max(0.2, Math.min(5.0, lngMeters / Math.max(latMeters, 1)))
  const W = 9.0
  const D = 9.0 / aspect

  const metersPerThreeUnit = Math.max(lngMeters / W, 1)

  const widthKm = (lngMeters / 1000).toFixed(2)
  const heightKm = (latMeters / 1000).toFixed(2)

  // Base slim y elegante
  const baseDepth = 0.45

  // Cálculo de elevación métrica rigurosa 1:1
  const computeHeight = useCallback(
    (elev, minElev, exag) => {
      const reliefMeters = Math.max(0, elev - minElev)
      const heightInThreeUnits = reliefMeters / metersPerThreeUnit
      return heightInThreeUnits * exag
    },
    [metersPerThreeUnit],
  )

  // 1. Inicialización de Escena Three.js
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 600

    // 1. Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(studioTheme === "light" ? 0xdfe6dc : 0x09090b)
    sceneRef.current = scene

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(13.5, 11, 14.5)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = studioTheme === "light" ? 1.08 : 1.25
    container.innerHTML = ""
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 3
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 5. Luces de Estudio Fotorrealistas
    const hemiLight = new THREE.HemisphereLight(
      studioTheme === "light" ? 0xffffff : 0x384252,
      studioTheme === "light" ? 0xd0d5cc : 0x18181b,
      studioTheme === "light" ? 1.1 : 0.75,
    )
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.8)
    dirLight.position.set(12, 22, 12)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 70
    dirLight.shadow.camera.left = -16
    dirLight.shadow.camera.right = 16
    dirLight.shadow.camera.top = 16
    dirLight.shadow.camera.bottom = -16
    dirLight.shadow.bias = -0.0004
    dirLight.shadow.normalBias = 0.02
    scene.add(dirLight)
    sunLightRef.current = dirLight

    const fillLight = new THREE.DirectionalLight(0xa5c4d4, studioTheme === "light" ? 0.65 : 0.4)
    fillLight.position.set(-14, 12, -14)
    scene.add(fillLight)

    // 6. Construcción del Bloque Geológico Fotorrealista
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    // Resolución de malla densa (160x160 = 25,600 vértices para topografía SRTM 30m real)
    const segX = 160
    const segZ = 160

    // Cuestreo inicial síncrono
    const grid = []
    let minElev = Infinity
    let maxElev = -Infinity

    for (let j = 0; j <= segZ; j++) {
      const v = j / segZ
      const lat = maxLat - v * (maxLat - minLat)
      for (let i = 0; i <= segX; i++) {
        const u = i / segX
        const lng = minLng + u * (maxLng - minLng)
        const e = sampleElevation(lng, lat, elevationAt, map)
        grid.push(e)
        if (e < minElev) minElev = e
        if (e > maxElev) maxElev = e
      }
    }

    if (!isFinite(minElev)) minElev = 0
    if (!isFinite(maxElev)) maxElev = 100
    elevationMinRef.current = minElev
    elevationMaxRef.current = maxElev
    elevationGridRef.current = grid

    // --- A. Superficie Topográfica Superior ---
    const topGeom = new THREE.PlaneGeometry(W, D, segX, segZ)
    topGeom.rotateX(-Math.PI / 2)
    const topPos = topGeom.attributes.position

    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      const yVal = computeHeight(e, minElev, exaggeration)
      topPos.setY(k, yVal)
    }
    topPos.needsUpdate = true
    topGeom.computeVertexNormals()

    // Textura de superficie
    let terrainTexture = null
    if (rectangle?.textureDataUrl) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = rectangle.textureDataUrl
      terrainTexture = new THREE.Texture(img)
      terrainTexture.generateMipmaps = true
      terrainTexture.minFilter = THREE.LinearMipmapLinearFilter
      terrainTexture.magFilter = THREE.LinearFilter
      if (renderer?.capabilities) {
        terrainTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
      }
      img.onload = () => {
        terrainTexture.needsUpdate = true
      }
    } else {
      terrainTexture = createFallbackTerrainTexture()
    }

    const topMat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      roughness: 0.75,
      metalness: 0.04,
      flatShading: false,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
    blockGroup.add(topMesh)
    topMeshRef.current = topMesh

    // --- B. Paredes Verticales de Falda con Tierra Natural Cálida ---
    const earthTexture = createHomogeneousEarthTexture()
    const wallPositions = []
    const wallUVs = []

    function addWall(p0x, p0z, p1x, p1z, getElevA, getElevB, steps) {
      for (let s = 0; s < steps; s++) {
        const uA = s / steps
        const uB = (s + 1) / steps
        const xA = p0x + (p1x - p0x) * uA
        const zA = p0z + (p1z - p0z) * uA
        const xB = p0x + (p1x - p0x) * uB
        const zB = p0z + (p1z - p0z) * uB

        const yTopA = computeHeight(getElevA(s), minElev, exaggeration)
        const yTopB = computeHeight(getElevB(s + 1), minElev, exaggeration)
        const yBot = -baseDepth

        wallPositions.push(xA, yTopA, zA, xA, yBot, zA, xB, yTopB, zB)
        wallPositions.push(xB, yTopB, zB, xA, yBot, zA, xB, yBot, zB)

        wallUVs.push(uA, 1, uA, 0, uB, 1)
        wallUVs.push(uB, 1, uA, 0, uB, 0)
      }
    }

    const halfW = W / 2
    const halfD = D / 2

    // Pared Norte (-Z)
    addWall(-halfW, -halfD, halfW, -halfD, (s) => grid[s], (s) => grid[s], segX)
    // Pared Este (+X)
    addWall(halfW, -halfD, halfW, halfD, (s) => grid[s * (segX + 1) + segX], (s) => grid[s * (segX + 1) + segX], segZ)
    // Pared Sur (+Z)
    addWall(halfW, halfD, -halfW, halfD, (s) => grid[segZ * (segX + 1) + (segX - s)], (s) => grid[segZ * (segX + 1) + (segX - s)], segX)
    // Pared Oeste (-X)
    addWall(-halfW, halfD, -halfW, -halfD, (s) => grid[(segZ - s) * (segX + 1)], (s) => grid[(segZ - s) * (segX + 1)], segZ)

    const wallGeom = new THREE.BufferGeometry()
    wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3))
    wallGeom.setAttribute("uv", new THREE.Float32BufferAttribute(wallUVs, 2))
    wallGeom.computeVertexNormals()

    const wallMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.88,
      metalness: 0.03,
      side: THREE.DoubleSide,
    })
    const wallsMesh = new THREE.Mesh(wallGeom, wallMat)
    wallsMesh.castShadow = true
    wallsMesh.receiveShadow = true
    blockGroup.add(wallsMesh)
    wallsMeshRef.current = wallsMesh

    // --- C. Base inferior plana del bloque ---
    const bottomGeom = new THREE.PlaneGeometry(W, D)
    bottomGeom.rotateX(Math.PI / 2)
    bottomGeom.translate(0, -baseDepth, 0)
    const bottomMat = new THREE.MeshStandardMaterial({
      color: 0x3d2514,
      roughness: 0.9,
    })
    const bottomMesh = new THREE.Mesh(bottomGeom, bottomMat)
    bottomMesh.receiveShadow = true
    blockGroup.add(bottomMesh)

    // --- D. Plano receptor de sombras de estudio (Shadow Catcher) ---
    const floorGeom = new THREE.PlaneGeometry(90, 90)
    floorGeom.rotateX(-Math.PI / 2)
    floorGeom.translate(0, -baseDepth - 0.02, 0)
    const floorMat = new THREE.ShadowMaterial({
      opacity: studioTheme === "light" ? 0.22 : 0.45,
    })
    const floorMesh = new THREE.Mesh(floorGeom, floorMat)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)
    floorMeshRef.current = floorMesh

    // --- E. Grupo de Pines Dinámicos ---
    const pinsGroup = new THREE.Group()
    blockGroup.add(pinsGroup)
    pinsGroupRef.current = pinsGroup

    // 7. Bucle de animación continuo
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      if (autoRotateRef.current && blockGroupRef.current) {
        blockGroupRef.current.rotation.y += 0.0035
      }
      renderer.render(scene, camera)
    }
    animate()

    // 8. Manejo de redimensionamiento
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return
      const w = containerRef.current.clientWidth || 600
      const h = containerRef.current.clientHeight || 600
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", handleResize)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener("resize", handleResize)
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      controls.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, aspect, maxLat, minLat, maxLng, minLng, studioTheme, elevationAt, map, computeHeight, exaggeration, W, D])

  // --- Carga de Teselas de Satélite en Ultra Alta Resolución (2048x2048 nativas) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return
    let canceled = false

    loadHighResSatelliteTexture(rectangle.bbox, basemap).then((highResDataUrl) => {
      if (canceled || !highResDataUrl || !topMeshRef.current?.material) return
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = highResDataUrl
      img.onload = () => {
        if (canceled) return
        const tex = new THREE.Texture(img)
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        if (rendererRef.current?.capabilities) {
          tex.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy()
        }
        tex.needsUpdate = true
        if (topMeshRef.current?.material) {
          topMeshRef.current.material.map = tex
          topMeshRef.current.material.needsUpdate = true
        }
      }
    })

    return () => {
      canceled = true
    }
  }, [isOpen, rectangle?.bbox, basemap])

  // --- Carga Asíncrona del DEM Real de 30 metros (Nivel nativo SRTM 13) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return

    let canceled = false
    const [minLng, minLat, maxLng, maxLat] = rectangle.bbox

    // Nivel 13 = resolución nativa de 30m de SRTM
    const targetZoom = DEM_MAX_ZOOM
    const range = tileRangeFor({ west: minLng, east: maxLng, south: minLat, north: maxLat }, targetZoom)
    const tiles = tilesOf(range)

    loadMosaic(TERRAIN_TILE_TEMPLATE, tiles, range)
      .then(({ heights, missing }) => {
        if (canceled || missing === tiles.length) return

        const segX = 160
        const segZ = 160
        const realGrid = []
        let rMin = Infinity
        let rMax = -Infinity

        for (let j = 0; j <= segZ; j++) {
          const v = j / segZ
          const lat = maxLat - v * (maxLat - minLat)
          for (let i = 0; i <= segX; i++) {
            const u = i / segX
            const lng = minLng + u * (maxLng - minLng)
            const val = sampleMosaicBilinear(lng, lat, heights, range)
            let elev = val
            if (elev === null) {
              elev = sampleElevation(lng, lat, elevationAt, map)
            }
            realGrid.push(elev)
            if (elev < rMin) rMin = elev
            if (elev > rMax) rMax = elev
          }
        }

        if (!isFinite(rMin)) rMin = 0
        if (!isFinite(rMax)) rMax = 100

        elevationMinRef.current = rMin
        elevationMaxRef.current = rMax
        elevationGridRef.current = realGrid
        setDemLoaded(true)

        // Deformar la geometría con la topografía real SRTM 30m
        if (topMeshRef.current && wallsMeshRef.current) {
          const topPos = topMeshRef.current.geometry.attributes.position
          for (let k = 0; k < topPos.count; k++) {
            const e = realGrid[k] ?? rMin
            topPos.setY(k, computeHeight(e, rMin, exaggeration))
          }
          topPos.needsUpdate = true
          topMeshRef.current.geometry.computeVertexNormals()

          // Actualizar paredes laterales
          const wallPos = wallsMeshRef.current.geometry.attributes.position
          let idx = 0

          function updateWallSeg(getElevA, getElevB, steps) {
            for (let s = 0; s < steps; s++) {
              const yTopA = computeHeight(getElevA(s), rMin, exaggeration)
              const yTopB = computeHeight(getElevB(s + 1), rMin, exaggeration)
              wallPos.setY(idx + 0, yTopA)
              wallPos.setY(idx + 1, -baseDepth)
              wallPos.setY(idx + 2, yTopB)
              wallPos.setY(idx + 3, yTopB)
              wallPos.setY(idx + 4, -baseDepth)
              wallPos.setY(idx + 5, -baseDepth)
              idx += 6
            }
          }

          updateWallSeg((s) => realGrid[s], (s) => realGrid[s], segX)
          updateWallSeg((s) => realGrid[s * (segX + 1) + segX], (s) => realGrid[s * (segX + 1) + segX], segZ)
          updateWallSeg((s) => realGrid[segZ * (segX + 1) + (segX - s)], (s) => realGrid[segZ * (segX + 1) + (segX - s)], segX)
          updateWallSeg((s) => realGrid[(segZ - s) * (segX + 1)], (s) => realGrid[(segZ - s) * (segX + 1)], segZ)

          wallPos.needsUpdate = true
          wallsMeshRef.current.geometry.computeVertexNormals()
        }
      })
      .catch(() => {
        // fallback síncrono activo
      })

    return () => {
      canceled = true
    }
  }, [isOpen, rectangle?.bbox, exaggeration, elevationAt, map, computeHeight])

  // Actualización de exageración vertical
  useEffect(() => {
    if (!topMeshRef.current || !wallsMeshRef.current) return
    const grid = elevationGridRef.current
    if (!grid || grid.length === 0) return

    const minElev = elevationMinRef.current
    const segX = 160
    const segZ = 160

    // Top
    const topPos = topMeshRef.current.geometry.attributes.position
    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      topPos.setY(k, computeHeight(e, minElev, exaggeration))
    }
    topPos.needsUpdate = true
    topMeshRef.current.geometry.computeVertexNormals()

    // Paredes
    const wallPos = wallsMeshRef.current.geometry.attributes.position
    let idx = 0

    function updateWallSeg(getElevA, getElevB, steps) {
      for (let s = 0; s < steps; s++) {
        const yTopA = computeHeight(getElevA(s), minElev, exaggeration)
        const yTopB = computeHeight(getElevB(s + 1), minElev, exaggeration)
        wallPos.setY(idx + 0, yTopA)
        wallPos.setY(idx + 1, -baseDepth)
        wallPos.setY(idx + 2, yTopB)
        wallPos.setY(idx + 3, yTopB)
        wallPos.setY(idx + 4, -baseDepth)
        wallPos.setY(idx + 5, -baseDepth)
        idx += 6
      }
    }

    updateWallSeg((s) => grid[s], (s) => grid[s], segX)
    updateWallSeg((s) => grid[s * (segX + 1) + segX], (s) => grid[s * (segX + 1) + segX], segZ)
    updateWallSeg((s) => grid[segZ * (segX + 1) + (segX - s)], (s) => grid[segZ * (segX + 1) + (segX - s)], segX)
    updateWallSeg((s) => grid[(segZ - s) * (segX + 1)], (s) => grid[(segZ - s) * (segX + 1)], segZ)

    wallPos.needsUpdate = true
    wallsMeshRef.current.geometry.computeVertexNormals()

    // Actualizar altura de los pines
    if (pinsGroupRef.current) {
      pinsGroupRef.current.children.forEach((pGroup) => {
        const pId = pGroup.userData.pinId
        const pinData = pins.find((p) => p.id === pId)
        if (pinData) {
          pGroup.position.y = computeHeight(pinData.elev, minElev, exaggeration)
        }
      })
    }
  }, [exaggeration, computeHeight, pins])

  // Actualización de ángulo solar y sombras
  const updateSunAngle = useCallback((deg, height = 18, intensity = 2.8, color = 0xfffaed) => {
    setSunAngle(deg)
    if (!sunLightRef.current) return
    const rad = (deg * Math.PI) / 180
    const dist = 16
    const x = Math.cos(rad) * dist
    const z = Math.sin(rad) * dist
    sunLightRef.current.position.set(x, height, z)
    sunLightRef.current.intensity = intensity
    sunLightRef.current.color.setHex(color)
  }, [])

  const changeSunPreset = useCallback((preset) => {
    setSunPreset(preset)
    if (preset === "morning") {
      updateSunAngle(120, 8, 2.2, 0xffedd5)
    } else if (preset === "noon") {
      updateSunAngle(45, 22, 2.8, 0xfffaed)
    } else if (preset === "sunset") {
      updateSunAngle(310, 5, 2.3, 0xfdba74)
    }
  }, [updateSunAngle])

  useEffect(() => {
    if (topMeshRef.current) topMeshRef.current.material.wireframe = wireframe
    if (wallsMeshRef.current) wallsMeshRef.current.material.wireframe = wireframe
  }, [wireframe])

  // Sincronizar pines en el grupo Three.js
  useEffect(() => {
    if (!pinsGroupRef.current) return
    const group = pinsGroupRef.current
    while (group.children.length > 0) {
      group.remove(group.children[0])
    }
    const minElev = elevationMinRef.current

    pins.forEach((pin) => {
      const pinObj = buildPinMesh({
        ...pin,
        y: computeHeight(pin.elev, minElev, exaggeration),
      })
      group.add(pinObj)
    })
  }, [pins, exaggeration, computeHeight])

  // Manejo de clic para agregar pin interactivo sobre el terreno
  const handleCanvasClick = useCallback(
    (e) => {
      if (!isAddingPin || !containerRef.current || !cameraRef.current || !topMeshRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current)
      const intersects = raycaster.intersectObject(topMeshRef.current)

      if (intersects.length > 0) {
        const hit = intersects[0]
        const p = hit.point

        const halfW = W / 2
        const halfD = D / 2
        const u = Math.max(0, Math.min(1, (p.x + halfW) / W))
        const v = Math.max(0, Math.min(1, (p.z + halfD) / D))

        const lng = minLng + u * (maxLng - minLng)
        const lat = maxLat - v * (maxLat - minLat)

        const minElev = elevationMinRef.current
        const realElev = minElev + (p.y / Math.max(exaggeration, 0.1)) * metersPerThreeUnit

        const newPin = {
          id: Date.now(),
          x: p.x,
          y: p.y,
          z: p.z,
          lng,
          lat,
          elev: Math.round(realElev),
          text: `Punto ${pins.length + 1}`,
          color: "#10b981",
        }

        setPins((prev) => [...prev, newPin])
        setSelectedPinId(newPin.id)
        setEditingPinText(newPin.text)
        setIsAddingPin(false)
      }
    },
    [isAddingPin, W, D, minLng, maxLng, minLat, maxLat, exaggeration, metersPerThreeUnit, pins.length],
  )

  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(13.5, 11, 14.5)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
    if (blockGroupRef.current) blockGroupRef.current.rotation.y = 0
  }, [])

  const handleSnapshot = useCallback(() => {
    if (!rendererRef.current) return
    const dataUrl = rendererRef.current.domElement.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = "bloque_3d_terreno.png"
    a.click()
  }, [])

  if (!isOpen) return null

  const isLight = studioTheme === "light"
  const selectedPin = pins.find((p) => p.id === selectedPinId)

  return (
    <div
      className={`relative h-full w-full overflow-hidden flex flex-col select-none transition-colors duration-300 ${
        isLight ? "bg-[#dfe6dc]" : "bg-[#09090b]"
      }`}
    >
      {/* Barra de cabecera Studio */}
      <div
        className={`absolute top-3 left-3 right-3 z-20 flex items-center justify-between rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-2xl transition-all ${
          isLight
            ? "border-zinc-300/80 bg-white/85 text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            : "border-zinc-800/80 bg-[#09090b]/85 text-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl border ${
              isLight
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            <Square className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tracking-tight">
                Bloque 3D del Terreno
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                  demLoaded
                    ? isLight
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                    : "bg-zinc-200 text-zinc-700 border-zinc-300"
                }`}
              >
                {demLoaded ? "DEM Real 30m" : "Relieve Real"}
              </span>
            </div>
            <p className={`text-[11px] ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>
              {widthKm} km × {heightKm} km · Cota: {Math.round(elevationMinRef.current)} m a {Math.round(elevationMaxRef.current)} m
            </p>
          </div>
        </div>

        {/* Acciones de cabecera */}
        <div className="flex items-center gap-1.5">
          {onRedrawRectangle && (
            <button
              type="button"
              onClick={onRedrawRectangle}
              title="Cambiar área (dibujar otro rectángulo con zoom libre)"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11.5px] font-medium transition-all active:scale-95 ${
                isLight
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
              }`}
            >
              <Square className="h-3.5 w-3.5" />
              <span>Cambiar área</span>
            </button>
          )}

          {/* Botón interactivo para añadir pin personalizado */}
          <button
            type="button"
            onClick={() => setIsAddingPin((p) => !p)}
            title={isAddingPin ? "Cancelar colocación de pin" : "Colocar un pin sobre el relieve 3D"}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11.5px] font-medium transition-all active:scale-95 ${
              isAddingPin
                ? "border-amber-500 bg-amber-500/20 text-amber-300 animate-pulse"
                : isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>{isAddingPin ? "Haz clic en el mapa" : "Agregar Pin"}</span>
          </button>

          {/* Toggle de tema de estudio */}
          <button
            type="button"
            onClick={() => setStudioTheme((t) => (t === "light" ? "dark" : "light"))}
            title={isLight ? "Cambiar a estudio oscuro" : "Cambiar a estudio claro (diorama)"}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
          </button>

          {/* Restablecer cámara */}
          <button
            type="button"
            onClick={handleResetCamera}
            title="Restablecer posición de cámara 3D"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Captura de pantalla PNG */}
          <button
            type="button"
            onClick={handleSnapshot}
            title="Descargar imagen PNG del bloque 3D"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>

          {/* Maximizar / Restaurar panel */}
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restaurar pantalla dividida" : "Maximizar vista del bloque 3D"}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                isLight
                  ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}

          {/* Botón cerrar */}
          <button
            type="button"
            onClick={onClose}
            title="Cerrar bloque 3D del terreno"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-red-50 hover:text-red-600"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-red-950/40 hover:text-red-400"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Editor flotante de Pin Seleccionado */}
      {selectedPin && (
        <div
          className={`absolute top-16 right-3 z-30 flex flex-col gap-2 rounded-2xl border p-3 shadow-2xl backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 ${
            isLight
              ? "border-zinc-300 bg-white/95 text-zinc-800"
              : "border-zinc-800 bg-[#09090b]/95 text-zinc-100"
          } w-64`}
        >
          <div className="flex items-center justify-between border-b pb-2 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              <span>Editar Marcador 3D</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPinId(null)}
              className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-400">Texto del Pin:</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editingPinText}
                onChange={(e) => setEditingPinText(e.target.value)}
                maxLength={20}
                className={`flex-1 rounded-lg border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500 ${
                  isLight
                    ? "border-zinc-300 bg-zinc-50 text-zinc-800"
                    : "border-zinc-700 bg-zinc-900 text-zinc-100"
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  setPins((prev) =>
                    prev.map((p) => (p.id === selectedPin.id ? { ...p, text: editingPinText } : p)),
                  )
                }}
                title="Guardar texto"
                className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <label className="text-[11px] font-medium text-zinc-400">Color:</label>
            <div className="flex items-center gap-2">
              {[
                { label: "Verde", hex: "#10b981" },
                { label: "Ámbar", hex: "#f59e0b" },
                { label: "Azul", hex: "#3b82f6" },
                { label: "Rosa", hex: "#ec4899" },
                { label: "Púrpura", hex: "#8b5cf6" },
              ].map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => {
                    setPins((prev) =>
                      prev.map((p) => (p.id === selectedPin.id ? { ...p, color: c.hex } : p)),
                    )
                  }}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                    selectedPin.color === c.hex ? "scale-110 border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400">
            <span>Cota: {selectedPin.elev} m</span>
            <button
              type="button"
              onClick={() => {
                setPins((prev) => prev.filter((p) => p.id !== selectedPin.id))
                setSelectedPinId(null)
              }}
              className="flex items-center gap-1 text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      )}

      {/* Contenedor del Lienzo Three.js */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className={`relative h-full w-full ${
          isAddingPin ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
      />

      {/* Barra de Controles Studio Inferior */}
      <div
        className={`absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-2xl transition-all ${
          isLight
            ? "border-zinc-300/80 bg-white/85 text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            : "border-zinc-800/80 bg-[#09090b]/90 text-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
        }`}
      >
        {/* Control de Exageración Vertical (Métrica Rigurosa 1:1) */}
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>
            Exageración:
          </span>
          <input
            type="range"
            aria-label="Exageración vertical"
            min="0.5"
            max="4.0"
            step="0.1"
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
            className="h-1.5 w-24 accent-emerald-500 cursor-pointer bg-zinc-300 dark:bg-zinc-800 rounded-lg"
          />
          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold w-8">
            {exaggeration.toFixed(1)}×
          </span>
        </div>

        {/* Presets de Iluminación Solar */}
        <div className={`flex items-center gap-1 border-l pl-3 ${isLight ? "border-zinc-200" : "border-zinc-800"}`}>
          <Sun className={`h-3.5 w-3.5 mr-1 ${isLight ? "text-zinc-500" : "text-zinc-400"}`} />
          {[
            { id: "morning", label: "Amanecer" },
            { id: "noon", label: "Mediodía" },
            { id: "sunset", label: "Atardecer" },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => changeSunPreset(preset.id)}
              className={`rounded-lg px-2 py-0.5 text-[10.5px] font-medium transition-all ${
                sunPreset === preset.id
                  ? "bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700"
                  : isLight
                  ? "text-zinc-600 hover:bg-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Control de Ángulo Solar Continuo */}
        <div className={`flex items-center gap-2 border-l pl-3 ${isLight ? "border-zinc-200" : "border-zinc-800"}`}>
          <Compass className={`h-3.5 w-3.5 ${isLight ? "text-zinc-500" : "text-zinc-400"}`} />
          <span className={`text-[10.5px] font-medium ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>Luz:</span>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={sunAngle}
            onChange={(e) => updateSunAngle(parseInt(e.target.value))}
            className="h-1.5 w-20 accent-amber-500 cursor-pointer bg-zinc-300 dark:bg-zinc-800 rounded-lg"
            title="Girar posición del sol para ver sombras dinámicas"
          />
          <span className={`font-mono text-[10.5px] w-8 ${isLight ? "text-zinc-700" : "text-zinc-300"}`}>
            {sunAngle}°
          </span>
        </div>

        {/* Giro continuo y Malla */}
        <div className={`flex items-center gap-1 border-l pl-3 ${isLight ? "border-zinc-200" : "border-zinc-800"}`}>
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            title={autoRotate ? "Pausar rotación continua" : "Activar rotación continua"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
              autoRotate
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : isLight
                ? "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            title="Alternar modo alambre / wireframe"
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
              wireframe
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : isLight
                ? "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
