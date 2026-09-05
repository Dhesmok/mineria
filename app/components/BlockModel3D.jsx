"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import {
  Maximize2,
  Minimize2,
  X,
  Sun,
  Camera,
  RotateCw,
  Box,
  MapPin,
  Trash2,
  Layers,
  Activity,
  Compass,
  Mountain,
  Grid,
} from "lucide-react"
import { TILE_SIZE } from "../utils/demTiles"

/**
 * Textura procedural de tierra homogénea cálida (Minecraft-style earth / estrato natural)
 */
function createHomogeneousEarthTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (!ctx || typeof ctx.createImageData !== "function") return null

  const imgData = ctx.createImageData(512, 512)
  const data = imgData.data

  const baseR = 124
  const baseG = 84
  const baseB = 54

  for (let y = 0; y < 512; y++) {
    const v = y / 512
    const depthDarken = 1.0 - v * 0.18
    const band = Math.sin(y * 0.12) * 4 + Math.sin(y * 0.04) * 8

    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4
      const grain = (Math.random() - 0.5) * 14
      const fineNoise = Math.sin(x * 0.25) * Math.cos(y * 0.25) * 6

      data[idx] = Math.max(30, Math.min(240, Math.round((baseR + band + grain + fineNoise) * depthDarken)))
      data[idx + 1] = Math.max(20, Math.min(220, Math.round((baseG + band * 0.7 + grain * 0.8 + fineNoise * 0.7) * depthDarken)))
      data[idx + 2] = Math.max(10, Math.min(180, Math.round((baseB + band * 0.4 + grain * 0.5 + fineNoise * 0.4) * depthDarken)))
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.repeat.set(4, 1)
  texture.generateMipmaps = true
  return texture
}

/**
 * Textura procedural de relieve hipsométrico suave
 */
function createReliefBasemapTexture(grid, segX, segZ) {
  if (typeof document === "undefined" || !grid || grid.length === 0) return null
  const canvas = document.createElement("canvas")
  canvas.width = segX + 1
  canvas.height = segZ + 1
  const ctx = canvas.getContext("2d")
  if (!ctx || typeof ctx.createImageData !== "function") return null

  const imgData = ctx.createImageData(canvas.width, canvas.height)
  const data = imgData.data

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    if (Number.isFinite(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min)) min = 0
  if (!Number.isFinite(max) || max <= min) max = min + 100

  const range = Math.max(1, max - min)

  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const idx = (j * (segX + 1) + i) * 4
      const val = grid[j * (segX + 1) + i] ?? min
      const t = Math.max(0, Math.min(1, (val - min) / range))

      let r, g, b
      if (t < 0.2) {
        const u = t / 0.2
        r = 46 + u * (86 - 46)
        g = 125 + u * (168 - 125)
        b = 50 + u * (90 - 50)
      } else if (t < 0.5) {
        const u = (t - 0.2) / 0.3
        r = 86 + u * (180 - 86)
        g = 168 + u * (195 - 168)
        b = 90 + u * (110 - 90)
      } else if (t < 0.8) {
        const u = (t - 0.5) / 0.3
        r = 180 + u * (188 - 180)
        g = 195 + u * (143 - 195)
        b = 110 + u * (90 - 110)
      } else {
        const u = (t - 0.8) / 0.2
        r = 188 + u * (245 - 188)
        g = 143 + u * (245 - 143)
        b = 90 + u * (245 - 90)
      }

      data[idx] = Math.round(r)
      data[idx + 1] = Math.round(g)
      data[idx + 2] = Math.round(b)
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/**
 * Calcula el zoom de alta resolución para teselas satelitales (hasta 400 teselas, alcanzando Zoom 16/17)
 */
function getOptimalSatelliteTileRange(minLng, minLat, maxLng, maxLat, maxTiles = 400) {
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
 * Calcula el zoom óptimo para el DEM (nivel 15 para resolución sub-5m, o nivel 14)
 */
function getOptimalDemTileRange(minLng, minLat, maxLng, maxLat, maxTiles = 144) {
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
 * Descarga y compone directamente las teselas de satélite a resolución nativa ultra-nítida
 * usando fetch() con CORS seguro y createImageBitmap para evitar problemas de canvas tainted.
 */
async function loadHighResSatelliteCanvas(bbox, basemap = "satellite") {
  if (typeof document === "undefined" || !bbox) return null
  const [minLng, minLat, maxLng, maxLat] = bbox

  const opt = getOptimalSatelliteTileRange(minLng, minLat, maxLng, maxLat, 400)
  const { zoom, minX, maxX, minY, maxY, tilesX, tilesY } = opt
  const nTiles = 2 ** zoom

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
    // Google Satellite nativo (idéntico al visor)
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
  if (!fullCtx || typeof fullCtx.drawImage !== "function") return null

  const tilePromises = []
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileX = minX + tx
      const tileY = minY + ty
      const url = getTileUrl(tileX, tileY, zoom)

      const p = (async () => {
        try {
          const res = await fetch(url, { mode: "cors" })
          if (!res.ok) return
          const blob = await res.blob()
          if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob)
            fullCtx.drawImage(bitmap, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX)
            bitmap.close?.()
          } else {
            const img = new Image()
            img.crossOrigin = "anonymous"
            await new Promise((resolve) => {
              img.onload = () => {
                try {
                  fullCtx.drawImage(img, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX)
                } catch {}
                resolve(true)
              }
              img.onerror = () => resolve(false)
              img.src = URL.createObjectURL(blob)
            })
          }
        } catch {
          // Fallback ignorado
        }
      })()
      tilePromises.push(p)
    }
  }

  await Promise.all(tilePromises)

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

  // Lienzo nativo con dimensiones exactas para evitar desenfoque por interpolación
  const outW = Math.min(4096, Math.max(2048, Math.round(cropW)))
  const outH = Math.min(4096, Math.max(2048, Math.round(cropH)))

  const finalCanvas = document.createElement("canvas")
  finalCanvas.width = outW
  finalCanvas.height = outH
  const finalCtx = finalCanvas.getContext("2d")
  if (!finalCtx || typeof finalCtx.drawImage !== "function") return null

  finalCtx.imageSmoothingEnabled = true
  finalCtx.imageSmoothingQuality = "high"
  finalCtx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

  return finalCanvas
}

/**
 * Descarga y decodifica el mosaico DEM con elevación real continua libre de errores CORS.
 */
async function loadDemElevationGrid(bbox, segX, segZ) {
  if (typeof document === "undefined" || !bbox) return null
  const [minLng, minLat, maxLng, maxLat] = bbox

  const opt = getOptimalDemTileRange(minLng, minLat, maxLng, maxLat, 144)
  const { zoom, minX, minY, tilesX, tilesY } = opt

  const mosaicW = tilesX * TILE_SIZE
  const mosaicH = tilesY * TILE_SIZE
  const mosaicCanvas = document.createElement("canvas")
  mosaicCanvas.width = mosaicW
  mosaicCanvas.height = mosaicH
  const mosaicCtx = mosaicCanvas.getContext("2d", { willReadFrequently: true })
  if (!mosaicCtx || typeof mosaicCtx.getImageData !== "function") return null

  const tilePromises = []
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileX = minX + tx
      const tileY = minY + ty
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tileX}/${tileY}.png`

      const p = (async () => {
        try {
          const res = await fetch(url, { mode: "cors" })
          if (!res.ok) return
          const blob = await res.blob()
          if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob)
            mosaicCtx.drawImage(bitmap, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            bitmap.close?.()
          } else {
            const img = new Image()
            img.crossOrigin = "anonymous"
            await new Promise((resolve) => {
              img.onload = () => {
                try {
                  mosaicCtx.drawImage(img, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                } catch {}
                resolve(true)
              }
              img.onerror = () => resolve(false)
              img.src = URL.createObjectURL(blob)
            })
          }
        } catch {
          // fallo de tesela individual ignorado
        }
      })()
      tilePromises.push(p)
    }
  }

  await Promise.all(tilePromises)

  let data = null
  try {
    const imgData = mosaicCtx.getImageData(0, 0, mosaicW, mosaicH)
    data = imgData.data
  } catch (err) {
    console.warn("DEM getImageData fallo:", err)
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

      // Interpolación bilineal continua
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
 * Crea la etiqueta 2D del Pin
 */
function createPinSprite(labelText, isSelected = false) {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 384
  canvas.height = 96
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const radius = 22
  const x = 16
  const y = 14
  const w = 352
  const h = 68

  ctx.fillStyle = isSelected ? "rgba(2, 132, 199, 0.92)" : "rgba(15, 23, 42, 0.88)"
  ctx.strokeStyle = isSelected ? "#38bdf8" : "rgba(255, 255, 255, 0.35)"
  ctx.lineWidth = 3

  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.font = "bold 32px sans-serif"
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const display = labelText.length > 18 ? labelText.substring(0, 16) + "…" : labelText
  ctx.fillText(display, canvas.width / 2, y + h / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(1.6, 0.4, 1.0)
  return sprite
}

/**
 * Crea la aguja vertical del pin
 */
function createPinMesh(colorHex = 0x38bdf8, isSelected = false) {
  const pinGroup = new THREE.Group()

  const needleGeom = new THREE.CylinderGeometry(0.018, 0.005, 0.8, 12)
  needleGeom.translate(0, 0.4, 0)
  const needleMat = new THREE.MeshStandardMaterial({
    color: isSelected ? 0x38bdf8 : 0xffffff,
    metalness: 0.8,
    roughness: 0.2,
  })
  const needleMesh = new THREE.Mesh(needleGeom, needleMat)
  pinGroup.add(needleMesh)

  const headGeom = new THREE.SphereGeometry(0.09, 16, 16)
  headGeom.translate(0, 0.82, 0)
  const headMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.2,
    roughness: 0.1,
    emissive: isSelected ? colorHex : 0x000000,
    emissiveIntensity: isSelected ? 0.6 : 0.0,
  })
  const headMesh = new THREE.Mesh(headGeom, headMat)
  pinGroup.add(headMesh)

  return pinGroup
}

/**
 * Componente principal BlockModel3D
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
  const sunLightRef = useRef(null)
  const hemiLightRef = useRef(null)
  const animFrameRef = useRef(null)
  const pinsGroupRef = useRef(null)

  const elevationGridRef = useRef([])
  const elevationMinRef = useRef(0)
  const elevationMaxRef = useRef(100)

  const [exaggeration, setExaggeration] = useState(1.0)
  const exaggerationRef = useRef(1.0)
  useEffect(() => {
    exaggerationRef.current = exaggeration
  }, [exaggeration])

  const [sunPreset, setSunPreset] = useState("noon")
  const [sunAngle, setSunAngle] = useState(45)
  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  const [wireframe, setWireframe] = useState(false)
  const [studioTheme, setStudioTheme] = useState("dark")
  const [demLoading, setDemLoading] = useState(true)

  const [pins, setPins] = useState([])
  const [isAddingPin, setIsAddingPin] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState(null)
  const [editingPinText, setEditingPinText] = useState("")

  const bbox = rectangle?.bbox || [-75.6, 6.2, -75.5, 6.3]
  const bboxKey = bbox.join(",")
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

  const baseDepth = 0.45

  const computeHeight = useCallback(
    (elev, minElev, exag) => {
      const reliefMeters = Math.max(0, elev - minElev)
      const heightInThreeUnits = reliefMeters / metersPerThreeUnit
      return heightInThreeUnits * exag
    },
    [metersPerThreeUnit],
  )

  // Malla densa de 280x280 (78,400 celdas para fidelidad topográfica idéntica al visor)
  const segX = 280
  const segZ = 280

  // 1. Inicialización de Escena Three.js
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(studioTheme === "light" ? 0xdfe6dc : 0x09090b)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000)
    camera.position.set(13.5, 10.5, 14.5)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Colorimetría 1:1 fiel al visor (sRGB exacto sin desaturar ni quemar)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping

    container.innerHTML = ""
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 3
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // Iluminación natural sin quemar la fotografía satelital
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xa0a0a0, 1.15)
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    // Luz solar suave para dar relieve 3D sin generar agujeros negros
    const dirLight = new THREE.DirectionalLight(0xfffaed, 0.35)
    dirLight.position.set(13, 16, 13)
    dirLight.castShadow = false // No proyectar sombras duras artificiales sobre la foto satelital
    scene.add(dirLight)
    sunLightRef.current = dirLight

    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    // Muestreo inicial síncrono
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

    const currentExag = exaggerationRef.current
    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      const yVal = computeHeight(e, minElev, currentExag)
      topPos.setY(k, yVal)
    }
    topPos.needsUpdate = true
    topGeom.computeVertexNormals()

    const fallbackTex = createReliefBasemapTexture(grid, segX, segZ)
    const topMat = new THREE.MeshStandardMaterial({
      map: fallbackTex,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    // El terreno NO proyecta sombras duras sobre sí mismo para preservar la foto satelital original
    topMesh.castShadow = false
    topMesh.receiveShadow = false
    blockGroup.add(topMesh)
    topMeshRef.current = topMesh

    // --- B. Paredes Verticales de Falda ---
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

        const yTopA = computeHeight(getElevA(s), minElev, currentExag)
        const yTopB = computeHeight(getElevB(s + 1), minElev, currentExag)
        const yBot = -baseDepth

        wallPositions.push(xA, yTopA, zA, xA, yBot, zA, xB, yTopB, zB)
        wallPositions.push(xB, yTopB, zB, xA, yBot, zA, xB, yBot, zB)

        wallUVs.push(uA, 1, uA, 0, uB, 1)
        wallUVs.push(uB, 1, uA, 0, uB, 0)
      }
    }

    const halfW = W / 2
    const halfD = D / 2

    addWall(-halfW, -halfD, halfW, -halfD, (s) => grid[s], (s) => grid[s], segX)
    addWall(halfW, -halfD, halfW, halfD, (s) => grid[s * (segX + 1) + segX], (s) => grid[s * (segX + 1) + segX], segZ)
    addWall(halfW, halfD, -halfW, halfD, (s) => grid[segZ * (segX + 1) + (segX - s)], (s) => grid[segZ * (segX + 1) + (segX - s)], segX)
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

    // --- C. Base inferior plana ---
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

    // --- D. Receptor de sombras en el piso de estudio ---
    const floorGeom = new THREE.PlaneGeometry(90, 90)
    floorGeom.rotateX(-Math.PI / 2)
    floorGeom.translate(0, -baseDepth - 0.02, 0)
    const floorMat = new THREE.ShadowMaterial({
      opacity: studioTheme === "light" ? 0.22 : 0.45,
    })
    const floorMesh = new THREE.Mesh(floorGeom, floorMat)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // --- E. Grupo de Pines ---
    const pinsGroup = new THREE.Group()
    blockGroup.add(pinsGroup)
    pinsGroupRef.current = pinsGroup

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      if (autoRotateRef.current && blockGroupRef.current) {
        blockGroupRef.current.rotation.y += 0.0035
      }
      renderer.render(scene, camera)
    }
    animate()

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bboxKey, studioTheme])

  // 2. Carga Asíncrona de Textura Satelital Ultra-HD
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return
    let canceled = false

    if (basemap === "relief") {
      const grid = elevationGridRef.current
      if (grid && grid.length > 0 && topMeshRef.current?.material) {
        const reliefTex = createReliefBasemapTexture(grid, segX, segZ)
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
      // Colorimetría nativa sRGB para colores vivos idénticos al visor
      tex.colorSpace = THREE.SRGBColorSpace
      tex.generateMipmaps = true
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      if (rendererRef.current?.capabilities) {
        tex.anisotropy = rendererRef.current.capabilities.getMaxAnisotropy()
      }
      tex.needsUpdate = true

      if (topMeshRef.current?.material) {
        topMeshRef.current.material.map = tex
        topMeshRef.current.material.roughness = 0.95
        topMeshRef.current.material.metalness = 0.0
        topMeshRef.current.material.color.setHex(0xffffff)
        topMeshRef.current.material.needsUpdate = true
      }
    })

    return () => {
      canceled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bboxKey, basemap, segX, segZ])

  // 3. Carga Asíncrona del DEM Real de Máxima Resolución
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return
    let canceled = false
    setDemLoading(true)

    loadDemElevationGrid(rectangle.bbox, segX, segZ)
      .then((demRes) => {
        if (canceled || !demRes) return
        const { grid: realGrid, minElev: rMin, maxElev: rMax } = demRes

        elevationMinRef.current = rMin
        elevationMaxRef.current = rMax
        elevationGridRef.current = realGrid
        setDemLoading(false)

        const currentExag = exaggerationRef.current

        if (topMeshRef.current && wallsMeshRef.current) {
          const topPos = topMeshRef.current.geometry.attributes.position
          for (let k = 0; k < topPos.count; k++) {
            const e = realGrid[k] ?? rMin
            topPos.setY(k, computeHeight(e, rMin, currentExag))
          }
          topPos.needsUpdate = true
          topMeshRef.current.geometry.computeVertexNormals()

          if (basemap === "relief") {
            const reliefTex = createReliefBasemapTexture(realGrid, segX, segZ)
            if (reliefTex) {
              topMeshRef.current.material.map = reliefTex
              topMeshRef.current.material.needsUpdate = true
            }
          }

          const wallPos = wallsMeshRef.current.geometry.attributes.position
          let idx = 0

          function updateWallSeg(getElevA, getElevB, steps) {
            for (let s = 0; s < steps; s++) {
              const yTopA = computeHeight(getElevA(s), rMin, currentExag)
              const yTopB = computeHeight(getElevB(s + 1), rMin, currentExag)
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
      .catch((err) => {
        console.warn("Error cargando DEM:", err)
        setDemLoading(false)
      })

    return () => {
      canceled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bboxKey, computeHeight, basemap, segX, segZ, baseDepth])

  // 4. Actualización Instantánea de Exageración Vertical (0.5 ms sin tocar la escena)
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

    // Pines
    if (pinsGroupRef.current) {
      pinsGroupRef.current.children.forEach((pGroup) => {
        const pId = pGroup.userData.pinId
        const pinData = pins.find((p) => p.id === pId)
        if (pinData) {
          pGroup.position.y = computeHeight(pinData.elev, minElev, exaggeration)
        }
      })
    }
  }, [exaggeration, computeHeight, segX, segZ, baseDepth, pins])

  // Wireframe
  useEffect(() => {
    if (topMeshRef.current) {
      topMeshRef.current.material.wireframe = wireframe
    }
  }, [wireframe])

  // Ángulo de Iluminación Solar
  useEffect(() => {
    if (!sunLightRef.current) return
    const rad = (sunAngle * Math.PI) / 180
    const dist = 18
    let sunHeight = 14

    if (sunPreset === "morning") sunHeight = 8
    if (sunPreset === "noon") sunHeight = 18
    if (sunPreset === "sunset") sunHeight = 5

    const sx = Math.cos(rad) * dist
    const sz = Math.sin(rad) * dist
    sunLightRef.current.position.set(sx, sunHeight, sz)
  }, [sunAngle, sunPreset])

  // Renderizado dinámico de pines
  useEffect(() => {
    if (!pinsGroupRef.current) return
    const pGroup = pinsGroupRef.current
    while (pGroup.children.length > 0) {
      pGroup.remove(pGroup.children[0])
    }

    const minElev = elevationMinRef.current

    pins.forEach((pin) => {
      const pinObj = new THREE.Group()
      pinObj.userData = { pinId: pin.id }

      const pinMesh = createPinMesh(pin.color, pin.id === selectedPinId)
      pinObj.add(pinMesh)

      const sprite = createPinSprite(pin.label, pin.id === selectedPinId)
      if (sprite) {
        sprite.position.y = 1.15
        pinObj.add(sprite)
      }

      pinObj.position.set(
        pin.x,
        computeHeight(pin.elev, minElev, exaggeration),
        pin.z,
      )

      pGroup.add(pinObj)
    })
  }, [pins, selectedPinId, exaggeration, computeHeight])

  const handleCanvasClick = (e) => {
    if (!containerRef.current || !cameraRef.current || !topMeshRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, cameraRef.current)

    if (isAddingPin) {
      const intersects = raycaster.intersectObject(topMeshRef.current)
      if (intersects.length > 0) {
        const hit = intersects[0]
        const p = hit.point

        const minElev = elevationMinRef.current
        const maxElev = elevationMaxRef.current
        const totalHeight = computeHeight(maxElev, minElev, exaggeration)
        const relY = totalHeight > 0.001 ? Math.max(0, Math.min(1, hit.point.y / totalHeight)) : 0
        const calculatedElev = Math.round(minElev + relY * (maxElev - minElev))

        const newPin = {
          id: "pin-" + Date.now(),
          x: p.x,
          z: p.z,
          elev: calculatedElev,
          label: `Punto ${pins.length + 1}`,
          color: 0x38bdf8,
        }

        setPins((prev) => [...prev, newPin])
        setSelectedPinId(newPin.id)
        setEditingPinText(newPin.label)
        setIsAddingPin(false)
      }
      return
    }

    if (pinsGroupRef.current) {
      const pinHits = raycaster.intersectObjects(pinsGroupRef.current.children, true)
      if (pinHits.length > 0) {
        let cur = pinHits[0].object
        while (cur && !cur.userData?.pinId) {
          cur = cur.parent
        }
        if (cur?.userData?.pinId) {
          setSelectedPinId(cur.userData.pinId)
          const found = pins.find((p) => p.id === cur.userData.pinId)
          if (found) setEditingPinText(found.label)
          return
        }
      }
    }

    setSelectedPinId(null)
  }

  const handleScreenshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return
    rendererRef.current.render(sceneRef.current, cameraRef.current)
    const dataURL = rendererRef.current.domElement.toDataURL("image/png")
    const link = document.createElement("a")
    link.download = `bloque-3d-${Date.now()}.png`
    link.href = dataURL
    link.click()
  }

  if (!isOpen) return null

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 select-none overflow-hidden font-sans">
      {/* Cabecera Obsidian Glass */}
      <div className="h-12 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800/80 px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400">
            <Box size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
              Bloque 3D del Terreno
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Relieve Real
              </span>
            </span>
            <span className="text-[10px] text-zinc-400">
              {widthKm} × {heightKm} km · Escala Métrica 1:1
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onRedrawRectangle && (
            <button
              onClick={onRedrawRectangle}
              className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 rounded-md transition-all flex items-center gap-1.5"
              title="Seleccionar otra área en el mapa"
            >
              <Box size={13} />
              <span>Cambiar Área</span>
            </button>
          )}

          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-md border border-zinc-800 transition-colors"
              title={isMaximized ? "Restaurar tamaño normal" : "Maximizar pantalla completa"}
            >
              {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-md border border-zinc-800 transition-colors"
            title="Cerrar bloque 3D del terreno"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Contenedor del Lienzo WebGL 3D */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
      />

      {/* Badge de estado de carga DEM */}
      {demLoading && (
        <div className="absolute top-14 left-4 z-20 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-lg border border-sky-500/30 text-sky-400 text-xs shadow-lg animate-pulse">
          <Mountain size={14} className="animate-spin" />
          <span>Decodificando topografía DEM SRTM 30m...</span>
        </div>
      )}

      {/* Brújula e Indicador Norte Flotante */}
      <div className="absolute top-14 right-4 z-10 flex flex-col items-center bg-zinc-900/85 backdrop-blur-md p-2 rounded-xl border border-zinc-800/80 shadow-xl pointer-events-none">
        <Compass size={18} className="text-rose-500" />
        <span className="text-[9px] font-bold text-rose-400 tracking-wider mt-0.5">N</span>
      </div>

      {/* HUD de Controles Flotante Inferior */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md px-3 py-2 rounded-2xl border border-zinc-800/90 shadow-2xl">
        {/* Control de Exageración Vertical */}
        <div className="flex items-center gap-2 pr-3 border-r border-zinc-800">
          <Mountain size={14} className="text-zinc-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">
              Exageración:
            </span>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              aria-label="Exageración vertical"
              value={exaggeration}
              onChange={(e) => setExaggeration(parseFloat(e.target.value))}
              className="w-20 accent-sky-400 cursor-pointer h-1.5 bg-zinc-700 rounded-lg appearance-none"
            />
          </div>
          <span className="text-xs font-mono font-bold text-sky-400 w-8 text-right">
            {exaggeration.toFixed(1)}×
          </span>
        </div>

        {/* Control del Sol e Iluminación */}
        <div className="flex items-center gap-2 pr-3 border-r border-zinc-800">
          <Sun size={14} className="text-amber-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">
              Ángulo Sol
            </span>
            <input
              type="range"
              min="0"
              max="360"
              step="5"
              title="Girar posición del sol para ver sombras dinámicas"
              aria-label="Girar posición del sol para ver sombras dinámicas"
              value={sunAngle}
              onChange={(e) => setSunAngle(parseInt(e.target.value))}
              className="w-20 accent-amber-400 cursor-pointer h-1.5 bg-zinc-700 rounded-lg appearance-none"
            />
          </div>
          <span className="text-xs font-mono font-bold text-amber-300 w-9 text-right">
            {sunAngle}°
          </span>
        </div>

        {/* Presets Solares Rápidos */}
        <div className="flex items-center gap-1 pr-3 border-r border-zinc-800">
          <button
            onClick={() => setSunPreset("morning")}
            className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-all ${
              sunPreset === "morning"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "text-zinc-400 hover:text-zinc-200 border-transparent"
            }`}
          >
            Mañana
          </button>
          <button
            onClick={() => setSunPreset("noon")}
            className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-all ${
              sunPreset === "noon"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "text-zinc-400 hover:text-zinc-200 border-transparent"
            }`}
          >
            Mediodía
          </button>
          <button
            onClick={() => setSunPreset("sunset")}
            className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-all ${
              sunPreset === "sunset"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "text-zinc-400 hover:text-zinc-200 border-transparent"
            }`}
          >
            Tarde
          </button>
        </div>

        {/* Herramienta de Pines Personalizados */}
        <div className="flex items-center gap-1 pr-3 border-r border-zinc-800">
          <button
            onClick={() => setIsAddingPin(!isAddingPin)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
              isAddingPin
                ? "bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/30 animate-pulse"
                : "text-zinc-300 hover:text-white bg-zinc-800/60 border-zinc-700/60 hover:bg-zinc-800"
            }`}
            title={isAddingPin ? "Haz clic en el terreno para colocar el pin" : "Añadir pin sobre el terreno"}
          >
            <MapPin size={13} />
            <span>{isAddingPin ? "Colocar Pin..." : "+ Pin"}</span>
          </button>
        </div>

        {/* Botones de Función */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded-lg border transition-all ${
              autoRotate
                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border-transparent"
            }`}
            title={autoRotate ? "Detener giro continuo" : "Iniciar giro automático"}
          >
            <RotateCw size={15} />
          </button>

          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-1.5 rounded-lg border transition-all ${
              wireframe
                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border-transparent"
            }`}
            title="Alternar vista de malla de alambre"
          >
            <Grid size={15} />
          </button>

          <button
            onClick={() => setStudioTheme(studioTheme === "dark" ? "light" : "dark")}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded-lg border border-transparent transition-all"
            title={`Cambiar a fondo ${studioTheme === "dark" ? "claro" : "oscuro"}`}
          >
            <Activity size={15} />
          </button>

          <button
            onClick={handleScreenshot}
            className="p-1.5 text-zinc-400 hover:text-sky-400 hover:bg-zinc-800/80 rounded-lg border border-transparent transition-all"
            title="Exportar imagen PNG del bloque 3D"
          >
            <Camera size={15} />
          </button>
        </div>
      </div>

      {/* Editor flotante de Pin Seleccionado */}
      {selectedPinId && (
        <div className="absolute top-14 left-4 z-30 bg-zinc-900/95 backdrop-blur-md p-3 rounded-xl border border-sky-500/40 shadow-2xl flex flex-col gap-2 w-64 animate-in fade-in zoom-in duration-150">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
            <span className="flex items-center gap-1.5 text-sky-400">
              <MapPin size={14} /> Editar Marcador
            </span>
            <button
              onClick={() => setSelectedPinId(null)}
              className="text-zinc-400 hover:text-zinc-100 p-0.5"
            >
              <X size={13} />
            </button>
          </div>

          <input
            type="text"
            value={editingPinText}
            onChange={(e) => {
              setEditingPinText(e.target.value)
              setPins((prev) =>
                prev.map((p) => (p.id === selectedPinId ? { ...p, label: e.target.value } : p)),
              )
            }}
            placeholder="Nombre o cota..."
            className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 py-1 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              {[0x38bdf8, 0x10b981, 0xf59e0b, 0xef4444, 0xa855f7].map((colorHex) => (
                <button
                  key={colorHex}
                  onClick={() => {
                    setPins((prev) =>
                      prev.map((p) => (p.id === selectedPinId ? { ...p, color: colorHex } : p)),
                    )
                  }}
                  className="w-4 h-4 rounded-full border border-white/20 hover:scale-110 transition-transform"
                  style={{ backgroundColor: `#${colorHex.toString(16).padStart(6, "0")}` }}
                />
              ))}
            </div>

            <button
              onClick={() => {
                setPins((prev) => prev.filter((p) => p.id !== selectedPinId))
                setSelectedPinId(null)
              }}
              className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
              title="Eliminar este pin"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Leyenda Hipsométrica Flotante */}
      <div className="absolute bottom-4 left-4 z-10 bg-zinc-900/85 backdrop-blur-md px-3 py-2 rounded-xl border border-zinc-800/80 shadow-xl flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300">
          <Layers size={12} className="text-sky-400" />
          <span>Elevación Topográfica</span>
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
          <span>{Math.round(elevationMinRef.current)} m</span>
          <span>{Math.round(elevationMaxRef.current)} m</span>
        </div>
        <div className="w-28 h-1.5 rounded-full bg-gradient-to-r from-emerald-600 via-amber-400 to-rose-200" />
      </div>
    </div>
  )
}
