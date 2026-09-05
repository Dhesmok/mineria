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

import { TILE_SIZE } from "../utils/demTiles"

/**
 * Textura de tierra homogénea natural estilo corte geológico / maqueta física
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
  grad.addColorStop(0, "#5a3a22")    // Capa superficial orgánica (humus)
  grad.addColorStop(0.15, "#784f30") // Suelo fértil cálido
  grad.addColorStop(0.48, "#8e623d") // Estrato de tierra franca arcillosa
  grad.addColorStop(0.82, "#6f4829") // Subsuelo compacto
  grad.addColorStop(1, "#52331b")    // Base profunda
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // 2. Gránulos minerales y motas de suelo natural (efecto tierra compacta)
  for (let i = 0; i < 5000; i++) {
    const px = Math.random() * 512
    const py = Math.random() * 512
    const sz = 0.8 + Math.random() * 2.0
    const rnd = Math.random()
    if (rnd < 0.38) {
      ctx.fillStyle = "rgba(35, 20, 10, 0.32)" // Humus oscuro
    } else if (rnd < 0.72) {
      ctx.fillStyle = "rgba(180, 130, 90, 0.28)" // Partícula arcillosa clara
    } else {
      ctx.fillStyle = "rgba(235, 205, 175, 0.20)" // Mota mineral / cuarzo
    }
    ctx.fillRect(px, py, sz, sz)
  }

  // 3. Finas micro-láminas horizontales orgánicas de sedimentación
  for (let y = 0; y < 512; y += 10) {
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
 * Textura topográfica hipsométrica suave de alta definición si no hay satélite o basemap === "relief"
 */
function createReliefBasemapTexture(grid, segX, segZ) {
  if (typeof document === "undefined" || !grid || grid.length === 0) return null
  const width = segX + 1
  const height = segZ + 1
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx || typeof ctx.createImageData !== "function") return null

  let minH = Infinity
  let maxH = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const h = grid[i]
    if (h < minH) minH = h
    if (h > maxH) maxH = h
  }
  const span = Math.max(1, maxH - minH)

  const imgData = ctx.createImageData(1024, 1024)
  const data = imgData.data

  for (let py = 0; py < 1024; py++) {
    const v = py / 1023
    const gy = v * (height - 1)
    const y0 = Math.floor(gy)
    const y1 = Math.min(height - 1, y0 + 1)
    const fy = gy - y0

    for (let px = 0; px < 1024; px++) {
      const u = px / 1023
      const gx = u * (width - 1)
      const x0 = Math.floor(gx)
      const x1 = Math.min(width - 1, x0 + 1)
      const fx = gx - x0

      const h00 = grid[y0 * width + x0] || minH
      const h10 = grid[y0 * width + x1] || minH
      const h01 = grid[y1 * width + x0] || minH
      const h11 = grid[y1 * width + x1] || minH

      const h = (1 - fx) * (1 - fy) * h00 + fx * (1 - fy) * h10 + (1 - fx) * fy * h01 + fx * fy * h11
      const normH = (h - minH) / span

      // Gradiente hipsométrico sobrio y elegante (verde valle -> ocre -> pardo alta montaña)
      let r = 70, g = 90, b = 60
      if (normH < 0.25) {
        const t = normH / 0.25
        r = 55 + t * 40
        g = 85 + t * 30
        b = 55 + t * 15
      } else if (normH < 0.6) {
        const t = (normH - 0.25) / 0.35
        r = 95 + t * 55
        g = 115 + t * 25
        b = 70 + t * 15
      } else {
        const t = (normH - 0.6) / 0.4
        r = 150 + t * 45
        g = 140 + t * 45
        b = 115 + t * 55
      }

      const idx = (py * 1024 + px) * 4
      data[idx] = Math.round(r)
      data[idx + 1] = Math.round(g)
      data[idx + 2] = Math.round(b)
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/**
 * Calcula de forma determinista el zoom óptimo para teselas satelitales (hasta 100 teselas sin restricciones)
 */
function getOptimalSatelliteTileRange(minLng, minLat, maxLng, maxLat, maxTiles = 100) {
  for (let z = 18; z >= 12; z--) {
    const n = 2 ** z
    const lng2t = (lon) => Math.floor(((lon + 180) / 360) * n)
    const lat2normY = (lat) => {
      const sin = Math.sin((lat * Math.PI) / 180)
      const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
      return (1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2
    }
    const lat2t = (lat) => Math.floor(lat2normY(lat) * n)

    const x0 = lng2t(minLng)
    const x1 = lng2t(maxLng)
    const y0 = lat2t(maxLat)
    const y1 = lat2t(minLat)
    const tx = Math.max(1, x1 - x0 + 1)
    const ty = Math.max(1, y1 - y0 + 1)
    if (tx * ty <= maxTiles) {
      return { zoom: z, minX: x0, maxX: x1, minY: y0, maxY: y1, tilesX: tx, tilesY: ty }
    }
  }
  return { zoom: 13, minX: 0, maxX: 1, minY: 0, maxY: 1, tilesX: 2, tilesY: 2 }
}

/**
 * Calcula el zoom óptimo para el DEM (nivel 14 o 15 para áreas locales, nivel 13 para áreas grandes)
 */
function getOptimalDemTileRange(minLng, minLat, maxLng, maxLat, maxTiles = 64) {
  for (let z = 15; z >= 12; z--) {
    const n = 2 ** z
    const lng2t = (lon) => Math.floor(((lon + 180) / 360) * n)
    const lat2normY = (lat) => {
      const sin = Math.sin((lat * Math.PI) / 180)
      const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
      return (1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2
    }
    const lat2t = (lat) => Math.floor(lat2normY(lat) * n)

    const minX = lng2t(minLng)
    const maxX = lng2t(maxLng)
    const minY = lat2t(maxLat)
    const maxY = lat2t(minLat)
    const tx = Math.max(1, maxX - minX + 1)
    const ty = Math.max(1, maxY - minY + 1)
    if (tx * ty <= maxTiles) {
      return { zoom: z, minX, maxX, minY, maxY, tilesX: tx, tilesY: ty }
    }
  }
  return { zoom: 12, minX: 0, maxX: 1, minY: 0, maxY: 1, tilesX: 2, tilesY: 2 }
}

/**
 * Descarga y compone directamente las teselas de satélite a resolución 4K nativa (4096x4096)
 * sin restricciones para cualquier mapa base activo.
 */
async function loadHighResSatelliteCanvas(bbox, basemap = "satellite") {
  if (typeof document === "undefined" || !bbox) return null
  const [minLng, minLat, maxLng, maxLat] = bbox

  const opt = getOptimalSatelliteTileRange(minLng, minLat, maxLng, maxLat, 100)
  const { zoom, minX, maxX, minY, maxY, tilesX, tilesY } = opt
  const nTiles = 2 ** zoom

  // Plantilla de URL limpia según mapa base
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
    if (basemap === "positron") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`
    }
    // Google Satellite por defecto con subdominio balanceado limpio
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
          try {
            fullCtx.drawImage(img, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX)
            resolve(true)
          } catch {
            resolve(false)
          }
        }
        img.onerror = () => resolve(false)
        img.src = url
      })
      tilePromises.push(p)
    }
  }

  await Promise.allSettled(tilePromises)

  // Recorte georreferenciado exacto del bbox dentro del mosaico descargado
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

  // Lienzo 4K de máxima definición con suavizado de alta calidad
  const finalCanvas = document.createElement("canvas")
  finalCanvas.width = 4096
  finalCanvas.height = 4096
  const finalCtx = finalCanvas.getContext("2d")
  if (!finalCtx) return null

  finalCtx.imageSmoothingEnabled = true
  finalCtx.imageSmoothingQuality = "high"
  finalCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, 4096, 4096)

  return finalCanvas
}

/**
 * Descarga y decodifica directamente el mosaico DEM con elevación real continua libre de concurrencias rotas
 */
async function loadDemElevationGrid(bbox, segX, segZ) {
  if (typeof document === "undefined" || !bbox) return null
  const [minLng, minLat, maxLng, maxLat] = bbox

  const opt = getOptimalDemTileRange(minLng, minLat, maxLng, maxLat, 64)
  const { zoom, minX, minY, tilesX, tilesY } = opt

  const mosaicW = tilesX * TILE_SIZE
  const mosaicH = tilesY * TILE_SIZE
  const mosaicCanvas = document.createElement("canvas")
  mosaicCanvas.width = mosaicW
  mosaicCanvas.height = mosaicH
  const mosaicCtx = mosaicCanvas.getContext("2d", { willReadFrequently: true })
  if (!mosaicCtx) return null

  const tilePromises = []
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileX = minX + tx
      const tileY = minY + ty
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tileX}/${tileY}.png`

      const p = new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          try {
            mosaicCtx.drawImage(img, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            resolve(true)
          } catch {
            resolve(false)
          }
        }
        img.onerror = () => resolve(false)
        img.src = url
      })
      tilePromises.push(p)
    }
  }

  await Promise.allSettled(tilePromises)

  // Leemos en una sola pasada atómica todos los píxeles de elevación
  let data = null
  try {
    const imgData = mosaicCtx.getImageData(0, 0, mosaicW, mosaicH)
    data = imgData.data
  } catch {
    return null
  }

  if (!data || data.length === 0) return null

  const getElevationAtPixel = (px, py) => {
    const x = Math.max(0, Math.min(mosaicW - 1, px))
    const y = Math.max(0, Math.min(mosaicH - 1, py))
    const idx = (y * mosaicW + x) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    // Fórmula oficial Terrarium: r * 256 + g + b / 256 - 32768
    const val = r * 256 + g + b / 256 - 32768
    return Number.isFinite(val) && val > -500 && val < 9000 ? val : null
  }

  const nTiles = 2 ** zoom
  const lat2normY = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180)
    const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
    return (1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2
  }

  const grid = []
  let minElev = Infinity
  let maxElev = -Infinity

  for (let j = 0; j <= segZ; j++) {
    const v = j / segZ
    const lat = maxLat - v * (maxLat - minLat)
    const normY = lat2normY(lat)
    const exactY = normY * nTiles * TILE_SIZE - minY * TILE_SIZE

    const y0 = Math.floor(exactY)
    const y1 = y0 + 1
    const fy = exactY - y0

    for (let i = 0; i <= segX; i++) {
      const u = i / segX
      const lng = minLng + u * (maxLng - minLng)
      const normX = (lng + 180) / 360
      const exactX = normX * nTiles * TILE_SIZE - minX * TILE_SIZE

      const x0 = Math.floor(exactX)
      const x1 = x0 + 1
      const fx = exactX - x0

      // Interpolación bilineal suave y continua de 4 píxeles contiguos
      const h00 = getElevationAtPixel(x0, y0)
      const h10 = getElevationAtPixel(x1, y0)
      const h01 = getElevationAtPixel(x0, y1)
      const h11 = getElevationAtPixel(x1, y1)

      let h = 1800
      if (h00 !== null && h10 !== null && h01 !== null && h11 !== null) {
        h = (1 - fx) * (1 - fy) * h00 + fx * (1 - fy) * h10 + (1 - fx) * fy * h01 + fx * fy * h11
      } else if (h00 !== null) {
        h = h00
      }

      grid.push(h)
      if (h < minElev) minElev = h
      if (h > maxElev) maxElev = h
    }
  }

  if (!isFinite(minElev)) minElev = 0
  if (!isFinite(maxElev)) maxElev = 100

  return { grid, minElev, maxElev }
}

/**
 * Crea la etiqueta 2D del Pin (Micro-tag estilizado, discreto y nítido)
 */
function createPinSprite(text, color = "#10b981") {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 320
  canvas.height = 96
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Sombra suave proyectada debajo de la cápsula
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)"
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 4

  // Fondo cápsula redondeada oscura moderna (estilo HUD técnico minimalista)
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)"
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(10, 10, 300, 76, 20)
  else ctx.rect(10, 10, 300, 76)
  ctx.fill()

  // Borde sutil
  ctx.shadowColor = "transparent"
  ctx.lineWidth = 2.5
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)"
  ctx.stroke()

  // Punto indicador de color a la izquierda
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(42, 48, 11, 0, Math.PI * 2)
  ctx.fill()

  // Texto nítido y esbelto
  ctx.fillStyle = "#ffffff"
  ctx.font = "600 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(text.slice(0, 16), 68, 49)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(0.32, 0.096, 1)
  return sprite
}

/**
 * Crea el objeto 3D de un Pin arquitectónico esbelto
 */
function buildPinMesh(pin) {
  const group = new THREE.Group()
  group.name = "pin_" + pin.id
  group.userData = { pinId: pin.id }

  // 1. Bolita de contacto precisa en el suelo
  const dotGeom = new THREE.SphereGeometry(0.012, 12, 12)
  const dotMat = new THREE.MeshStandardMaterial({
    color: pin.color || 0x10b981,
    metalness: 0.9,
    roughness: 0.15,
    emissive: pin.color || 0x10b981,
    emissiveIntensity: 0.3,
  })
  const dot = new THREE.Mesh(dotGeom, dotMat)
  dot.position.y = 0.008
  group.add(dot)

  // 2. Mástil / aguja metálica fina
  const needleHeight = 0.24
  const needleGeom = new THREE.CylinderGeometry(0.004, 0.004, needleHeight, 8)
  const needleMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    metalness: 0.95,
    roughness: 0.1,
  })
  const needle = new THREE.Mesh(needleGeom, needleMat)
  needle.position.y = needleHeight / 2
  group.add(needle)

  // 3. Etiqueta / Sprite proporcionada
  const sprite = createPinSprite(pin.text, pin.color || "#10b981")
  if (sprite) {
    sprite.position.y = needleHeight + 0.06
    group.add(sprite)
  }

  group.position.set(pin.x, pin.y, pin.z)
  return group
}

/**
 * Componente de Bloque 3D del Terreno (Máxima Definición 4K y Topografía Nítida sin Restricciones)
 */
export default function BlockModel3D({
  isOpen,
  onClose,
  rectangle,
  elevationAt,
  map: _map,
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
  const [_demLoaded, setDemLoaded] = useState(false)

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

  // Resolución de malla densa (256x256 = 65,536 vértices para modelado topográfico ultra-nítido)
  const segX = 256
  const segZ = 256

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
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000)
    camera.position.set(13.5, 10.5, 14.5)
    cameraRef.current = camera

    // 3. Renderer con alta precisión y antialiasing
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

    // 5. Iluminación de Estudio: Luz solar rasante para crear contraste y sombras de relieve
    const hemiLight = new THREE.HemisphereLight(
      studioTheme === "light" ? 0xffffff : 0x475569,
      studioTheme === "light" ? 0xd0d5cc : 0x18181b,
      studioTheme === "light" ? 1.0 : 0.65,
    )
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    // Luz solar rasante (altura 13) para que valles y crestas proyecten relieve real
    const dirLight = new THREE.DirectionalLight(0xfffaed, 3.4)
    dirLight.position.set(13, 13, 13)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 70
    dirLight.shadow.camera.left = -16
    dirLight.shadow.camera.right = 16
    dirLight.shadow.camera.top = 16
    dirLight.shadow.camera.bottom = -16
    dirLight.shadow.bias = -0.0003
    dirLight.shadow.normalBias = 0.025
    scene.add(dirLight)
    sunLightRef.current = dirLight

    const fillLight = new THREE.DirectionalLight(0xa5c4d4, studioTheme === "light" ? 0.6 : 0.4)
    fillLight.position.set(-13, 9, -13)
    scene.add(fillLight)

    // 6. Construcción del Bloque Geológico Fotorrealista
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    // Muestreo inicial síncrono rápido
    const grid = []
    let minElev = Infinity
    let maxElev = -Infinity

    for (let j = 0; j <= segZ; j++) {
      const v = j / segZ
      const lat = maxLat - v * (maxLat - minLat)
      for (let i = 0; i <= segX; i++) {
        const u = i / segX
        const lng = minLng + u * (maxLng - minLng)
        let e = 1800
        if (typeof elevationAt === "function") {
          try {
            const val = elevationAt({ lng, lat })
            if (Number.isFinite(val)) e = val
          } catch {}
        }
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

    // Textura inicial mientras carga el mosaico de satélite en alta resolución
    const fallbackTex = createReliefBasemapTexture(grid, segX, segZ)

    const topMat = new THREE.MeshStandardMaterial({
      map: fallbackTex,
      roughness: 0.82,
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
  }, [isOpen, aspect, maxLat, minLat, maxLng, minLng, studioTheme, computeHeight, exaggeration, W, D])

  // --- Carga de Teselas de Satélite en Ultra Alta Resolución 4K Nativa (4096x4096) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return
    let canceled = false

    if (basemap === "relief") {
      // Si el mapa base es relieve, generar textura hipsométrica analítica directa
      if (elevationGridRef.current && elevationGridRef.current.length > 0 && topMeshRef.current?.material) {
        const reliefTex = createReliefBasemapTexture(elevationGridRef.current, segX, segZ)
        if (reliefTex) {
          topMeshRef.current.material.map = reliefTex
          topMeshRef.current.material.needsUpdate = true
        }
      }
      return
    }

    loadHighResSatelliteCanvas(rectangle.bbox, basemap).then((canvas) => {
      if (canceled || !canvas || !topMeshRef.current?.material) return

      const tex = new THREE.CanvasTexture(canvas)
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
    })

    return () => {
      canceled = true
    }
  }, [isOpen, rectangle?.bbox, basemap])

  // --- Carga Asíncrona del DEM Real de Alta Definición (Mosaico Directo Libre de Concurrencias Rotas) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return

    let canceled = false

    loadDemElevationGrid(rectangle.bbox, segX, segZ)
      .then((demRes) => {
        if (canceled || !demRes) return
        const { grid: realGrid, minElev: rMin, maxElev: rMax } = demRes

        elevationMinRef.current = rMin
        elevationMaxRef.current = rMax
        elevationGridRef.current = realGrid
        setDemLoaded(true)

        // Deformar la geometría con la topografía real de alta definición
        if (topMeshRef.current && wallsMeshRef.current) {
          const topPos = topMeshRef.current.geometry.attributes.position
          for (let k = 0; k < topPos.count; k++) {
            const e = realGrid[k] ?? rMin
            topPos.setY(k, computeHeight(e, rMin, exaggeration))
          }
          topPos.needsUpdate = true
          topMeshRef.current.geometry.computeVertexNormals()

          // Si el mapa base es relieve, actualizar la textura de relieve con la elevación real
          if (basemap === "relief") {
            const reliefTex = createReliefBasemapTexture(realGrid, segX, segZ)
            if (reliefTex) {
              topMeshRef.current.material.map = reliefTex
              topMeshRef.current.material.needsUpdate = true
            }
          }

          // Actualizar paredes laterales de falda
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
  }, [isOpen, rectangle?.bbox, exaggeration, computeHeight, metersPerThreeUnit, basemap])

  // Actualización reactiva de exageración vertical
  useEffect(() => {
    if (!topMeshRef.current || !wallsMeshRef.current) return
    const grid = elevationGridRef.current
    if (!grid || grid.length === 0) return

    const minElev = elevationMinRef.current

    // Top Mesh
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
  }, [exaggeration, computeHeight, metersPerThreeUnit, pins])

  // Actualización de ángulo solar y sombras
  const updateSunAngle = useCallback((deg, height = 13, intensity = 3.4, color = 0xfffaed) => {
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
      updateSunAngle(120, 7, 2.8, 0xffedd5)
    } else if (preset === "noon") {
      updateSunAngle(45, 13, 3.4, 0xfffaed)
    } else if (preset === "sunset") {
      updateSunAngle(310, 5, 3.0, 0xfdba74)
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
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, cameraRef.current)

      const intersects = raycaster.intersectObject(topMeshRef.current)
      if (intersects.length > 0) {
        const hit = intersects[0]
        const p = hit.point

        // Convertir coordenadas 3D a cota estimada
        const minElev = elevationMinRef.current
        const maxElev = elevationMaxRef.current
        const reliefSpan = maxElev - minElev
        const relY = Math.max(0, p.y)
        const totalHeight = computeHeight(maxElev, minElev, exaggeration)
        const elev = Math.round(minElev + (totalHeight > 0 ? (relY / totalHeight) * reliefSpan : 0))

        const newPin = {
          id: "pin_" + Date.now(),
          x: p.x,
          y: p.y,
          z: p.z,
          elev,
          text: `Punto ${pins.length + 1} (${elev}m)`,
          color: "#10b981",
        }

        setPins((prev) => [...prev, newPin])
        setSelectedPinId(newPin.id)
        setEditingPinText(newPin.text)
        setIsAddingPin(false)
      }
    },
    [isAddingPin, pins.length, exaggeration, computeHeight],
  )

  const handleCaptureScreenshot = () => {
    if (!rendererRef.current) return
    const dataUrl = rendererRef.current.domElement.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `bloque-3d-${Date.now()}.png`
    a.click()
  }

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(13.5, 10.5, 14.5)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  const handleDeletePin = (id) => {
    setPins((prev) => prev.filter((p) => p.id !== id))
    if (selectedPinId === id) {
      setSelectedPinId(null)
      setEditingPinText("")
    }
  }

  const handleUpdatePinText = (id, text) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, text } : p)))
  }

  const handleUpdatePinColor = (id, color) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)))
  }

  if (!isOpen) return null

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#09090b] text-zinc-100 font-sans">
      {/* 1. Barra de Herramientas Superior Flotante */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        {/* Lado Izquierdo: Título y Datos Topográficos Reales */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-zinc-900/90 px-3 py-2 border border-zinc-800 shadow-2xl backdrop-blur-xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Compass className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Bloque 3D del Terreno
              </span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                Relieve Real
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              {widthKm} km × {heightKm} km • Cota {Math.round(elevationMinRef.current)}m - {Math.round(elevationMaxRef.current)}m
            </span>
          </div>
        </div>

        {/* Lado Derecho: Acciones y Cierre */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-zinc-900/90 p-1.5 border border-zinc-800 shadow-2xl backdrop-blur-xl">
          {onRedrawRectangle && (
            <button
              type="button"
              onClick={onRedrawRectangle}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              title="Seleccionar otra área en el mapa"
            >
              <Square className="h-3.5 w-3.5 text-emerald-400" />
              <span>Cambiar área</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCaptureScreenshot}
            className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Capturar imagen en alta resolución"
          >
            <Camera className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Restablecer vista de cámara"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              title={isMaximized ? "Restaurar vista dividida" : "Pantalla completa"}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
            title="Cerrar bloque 3D del terreno"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Lienzo WebGL Three.js con soporte para clics de pines */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className={`h-full w-full cursor-grab active:cursor-grabbing ${
          isAddingPin ? "cursor-crosshair active:cursor-crosshair" : ""
        }`}
      />

      {/* 3. Panel Flotante Inferior de Controles Fotorrealistas */}
      <div className="absolute bottom-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Controles Topográficos y de Iluminación */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-900/90 p-2 border border-zinc-800 shadow-2xl backdrop-blur-xl">
          {/* Exageración Vertical Fotorrealista */}
          <div className="flex items-center gap-2 rounded-xl bg-zinc-950/60 px-2.5 py-1.5 border border-zinc-800/80">
            <span className="text-[11px] font-semibold text-zinc-400">Exageración:</span>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={exaggeration}
              onChange={(e) => setExaggeration(parseFloat(e.target.value))}
              aria-label="Exageración vertical"
              className="w-16 h-1.5 accent-emerald-500 bg-zinc-800 rounded cursor-pointer"
            />
            <span className="text-xs font-bold text-emerald-400 min-w-[2.2rem]">
              {exaggeration.toFixed(1)}×
            </span>
          </div>

          {/* Iluminación Solar */}
          <div className="flex items-center gap-1.5 rounded-xl bg-zinc-950/60 px-2.5 py-1.5 border border-zinc-800/80">
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-semibold text-zinc-400">Sol:</span>
            <input
              type="range"
              min="0"
              max="360"
              value={sunAngle}
              onChange={(e) => updateSunAngle(parseInt(e.target.value))}
              title="Girar posición del sol para ver sombras dinámicas"
              aria-label="Posición solar"
              className="w-14 h-1.5 accent-amber-400 bg-zinc-800 rounded cursor-pointer"
            />
            <span className="text-xs font-bold text-amber-400 min-w-[2rem]">
              {sunAngle}°
            </span>
            {[
              { id: "morning", label: "Mañana" },
              { id: "noon", label: "Mediodía" },
              { id: "sunset", label: "Tarde" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => changeSunPreset(p.id)}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-all ${
                  sunPreset === p.id
                    ? "bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Giro Automático */}
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all border ${
              autoRotate
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10"
                : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
            title="Rotar automáticamente el bloque"
          >
            {autoRotate ? <Pause className="h-3.5 w-3.5 text-emerald-400" /> : <Play className="h-3.5 w-3.5" />}
            <span>Girar</span>
          </button>

          {/* Malla Wireframe */}
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all border ${
              wireframe
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
            title="Alternar vista de malla de triángulos"
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            <span>Malla</span>
          </button>

          {/* Tema del Estudio (Oscuro por defecto / Claro) */}
          <button
            type="button"
            onClick={() => setStudioTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-950/60 px-2.5 py-1.5 text-xs font-medium text-zinc-400 border border-zinc-800/80 hover:bg-zinc-800 hover:text-zinc-200 transition-all"
            title="Alternar fondo de estudio"
          >
            <Palette className="h-3.5 w-3.5 text-zinc-400" />
            <span>{studioTheme === "dark" ? "Fondo Claro" : "Fondo Oscuro"}</span>
          </button>
        </div>

        {/* Sistema de Pines Personalizados */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-zinc-900/90 p-2 border border-zinc-800 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setIsAddingPin((p) => !p)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all border ${
              isAddingPin
                ? "bg-emerald-500 text-zinc-950 border-emerald-400 shadow-lg shadow-emerald-500/25 animate-pulse"
                : "bg-zinc-950/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>{isAddingPin ? "Haz clic en el terreno" : "+ Agregar Pin"}</span>
          </button>

          {pins.length > 0 && (
            <span className="text-[11px] font-medium text-zinc-400 px-1">
              {pins.length} {pins.length === 1 ? "pin" : "pines"}
            </span>
          )}
        </div>
      </div>

      {/* 4. Modal / Drawer para editar texto y color del pin seleccionado */}
      {selectedPinId && (
        <div className="absolute top-16 right-4 z-40 w-72 rounded-2xl bg-zinc-900/95 p-3.5 border border-zinc-800 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
            <span className="text-xs font-bold text-zinc-200">Editar Marcador</span>
            <button
              type="button"
              onClick={() => setSelectedPinId(null)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Etiqueta
              </label>
              <input
                type="text"
                value={editingPinText}
                onChange={(e) => {
                  setEditingPinText(e.target.value)
                  handleUpdatePinText(selectedPinId, e.target.value)
                }}
                className="w-full rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs text-white border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                placeholder="Nombre del punto..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Color
              </label>
              <div className="flex items-center gap-2">
                {["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => handleUpdatePinColor(selectedPinId, col)}
                    className="h-5 w-5 rounded-full border border-white/20 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ backgroundColor: col }}
                  >
                    {pins.find((p) => p.id === selectedPinId)?.color === col && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => handleDeletePin(selectedPinId)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Eliminar</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPinId(null)}
                className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
