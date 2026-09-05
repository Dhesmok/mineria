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
} from "lucide-react"

import { loadMosaic } from "../utils/demTileLoader"
import { tileRangeFor, tilesOf, cellInMosaic, DEM_MAX_ZOOM } from "../utils/demTiles"
import { TERRAIN_TILE_TEMPLATE } from "../utils/mapStyles"

/**
 * Textura procedural de corte geológico / corteza terrestre natural
 * para las paredes laterales del bloque 3D (estilo maqueta de diorama físico).
 */
function createEarthCrossSectionTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // 1. Fondo base de roca madre profunda
  ctx.fillStyle = "#382e25"
  ctx.fillRect(0, 0, 1024, 1024)

  // 2. Estratos geológicos sedimentarios con ondulación orgánica
  // y = 0 es la base del bloque (cota inferior), y = 1024 es el borde superior (superficie del terreno)
  const strata = [
    { y0: 0, y1: 170, c1: "#30271f", c2: "#3f3329", freq: 0.016, amp: 8 },    // Basamento rocoso
    { y0: 170, y1: 310, c1: "#4a3c30", c2: "#5c4c3e", freq: 0.022, amp: 10 },  // Arenisca basal
    { y0: 310, y1: 430, c1: "#756350", c2: "#887561", freq: 0.028, amp: 12 },  // Estrato calizo claro
    { y0: 430, y1: 560, c1: "#4c4135", c2: "#5c5043", freq: 0.019, amp: 9 },   // Pizarra y arcilla
    { y0: 560, y1: 690, c1: "#6d5a47", c2: "#7e6a55", freq: 0.024, amp: 11 },  // Arenisca ferruginosa
    { y0: 690, y1: 800, c1: "#584a3c", c2: "#6a5a4b", freq: 0.032, amp: 8 },   // Aluvión / grava consolidada
    { y0: 800, y1: 910, c1: "#473b2e", c2: "#564839", freq: 0.027, amp: 7 },   // Subsuelo mineral
    { y0: 910, y1: 975, c1: "#35281d", c2: "#413224", freq: 0.038, amp: 5 },   // Horizonte B arcilloso
    { y0: 975, y1: 1024, c1: "#22170f", c2: "#2d1f14", freq: 0.045, amp: 4 },  // Capa vegetal orgánica / humus bajo césped
  ]

  for (const s of strata) {
    const yTop = 1024 - s.y1
    const yBot = 1024 - s.y0
    const grad = ctx.createLinearGradient(0, yTop, 0, yBot)
    grad.addColorStop(0, s.c1)
    grad.addColorStop(1, s.c2)
    ctx.fillStyle = grad

    ctx.beginPath()
    ctx.moveTo(0, yBot)
    for (let x = 0; x <= 1024; x += 16) {
      const wave = Math.sin(x * s.freq) * s.amp + Math.cos(x * s.freq * 2.2) * (s.amp * 0.45)
      ctx.lineTo(x, yTop + wave)
    }
    ctx.lineTo(1024, yBot)
    ctx.closePath?.()
    ctx.fill?.()
  }

  // 3. Finas micro-estratificaciones sedimentarias horizontales
  for (let y = 0; y < 1024; y += 4) {
    const alpha = (Math.sin(y * 0.18) * 0.5 + 0.5) * 0.14
    ctx.fillStyle = y % 8 === 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`
    ctx.fillRect(0, y, 1024, 2)
  }

  // 4. Moteado de grano mineral y roca triturada
  for (let i = 0; i < 2200; i++) {
    const px = Math.random() * 1024
    const py = Math.random() * 1024
    const sz = 1 + Math.random() * 2.5
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.09)"
    ctx.fillRect(px, py, sz, sz)
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

  // Gradiente natural de relieve
  const grad = ctx.createLinearGradient(0, 1024, 0, 0)
  grad.addColorStop(0, "#2d3728")
  grad.addColorStop(0.35, "#4a5d3e")
  grad.addColorStop(0.65, "#6b6255")
  grad.addColorStop(0.85, "#8a8175")
  grad.addColorStop(1, "#b5b0a8")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 1024)

  for (let i = 0; i < 600; i++) {
    const px = (i * 47) % 1024
    const py = (i * 31) % 1024
    ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)"
    ctx.fillRect(px, py, 2 + (i % 4), 2 + (i % 4))
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
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
 * Crea un sprite o marcador 3D (Pin blanco con texto, como en la imagen de referencia)
 */
function createPinMarker(text = "Área de Interés") {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 80
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Fondo blanco redondeado con sombra sutil
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(8, 8, 240, 64, 12); else ctx.rect?.(8, 8, 240, 64)
  ctx.fill?.()

  ctx.lineWidth = 3
  ctx.strokeStyle = "#e2e8f0"
  ctx.stroke?.()

  // Texto nítido
  ctx.fillStyle = "#0f172a"
  ctx.font = "bold 24px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text.slice(0, 16), 128, 40)

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(2.4, 0.75, 1)
  return sprite
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
  onRedrawRectangle,
  isMaximized,
  onToggleMaximize,
  expedientCode,
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
  const pinGroupRef = useRef(null)

  // Datos normalizados de elevación en memoria para deformación rápida
  const elevationGridRef = useRef([])
  const elevationMinRef = useRef(0)
  const elevationMaxRef = useRef(100)

  // Estados interactivos
  const [exaggeration, setExaggeration] = useState(2.0)
  const [sunPreset, setSunPreset] = useState("noon")
  const [sunAngle, setSunAngle] = useState(45) // Grados azimut
  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  const [wireframe, setWireframe] = useState(false)
  const [studioTheme, setStudioTheme] = useState("light") // "light" (como la foto de referencia) o "dark"
  const [showPin, setShowPin] = useState(true)
  const [demLoaded, setDemLoaded] = useState(false)

  // Medidas del rectángulo para visualización
  const bbox = rectangle?.bbox || [-75.6, 6.2, -75.5, 6.3]
  const [minLng, minLat, maxLng, maxLat] = bbox
  const aspect = Math.max(0.4, Math.min(2.5, (maxLat - minLat) / (maxLng - minLng || 0.0001)))
  const widthKm = ((maxLng - minLng) * 111.32 * Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180)).toFixed(2)
  const heightKm = ((maxLat - minLat) * 110.57).toFixed(2)

  // Inicialización de Three.js
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 600

    // 1. Escena con fondo neutro de estudio (Sage claro idéntico a la imagen)
    const scene = new THREE.Scene()
    const bgColor = studioTheme === "light" ? 0xdfe6dc : 0x09090b
    scene.background = new THREE.Color(bgColor)
    sceneRef.current = scene

    // 2. Cámara en perspectiva idéntica a maqueta isométrica
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(13.5, 12, 14.5)
    cameraRef.current = camera

    // 3. Renderer con Sombras Suaves PCF y Mapeo Fílmico ACES
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = studioTheme === "light" ? 1.05 : 1.25
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Controles orbitales con amortiguación suave
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxPolarAngle = Math.PI / 2 + 0.03
    controls.minDistance = 4
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 5. Iluminación realista estilo estudio fotográfico
    // Sol direccional que arroja sombras suaves sobre laderas y valles
    const sunLight = new THREE.DirectionalLight(0xfffaed, studioTheme === "light" ? 2.5 : 2.8)
    sunLight.position.set(12, 18, 10)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 1
    sunLight.shadow.camera.far = 45
    const shadowDist = 12
    sunLight.shadow.camera.left = -shadowDist
    sunLight.shadow.camera.right = shadowDist
    sunLight.shadow.camera.top = shadowDist
    sunLight.shadow.camera.bottom = -shadowDist
    sunLight.shadow.bias = -0.0004
    sunLight.shadow.normalBias = 0.025
    scene.add(sunLight)
    sunLightRef.current = sunLight

    // Luz hemisférica difusa (Cielo suave y rebote del plano)
    const hemiLight = new THREE.HemisphereLight(
      studioTheme === "light" ? 0xffffff : 0xbde0fe,
      studioTheme === "light" ? 0xc5cec2 : 0x1f1c19,
      studioTheme === "light" ? 1.1 : 0.9,
    )
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    // Luz de relleno lateral sutil
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.45)
    rimLight.position.set(-14, 10, -12)
    scene.add(rimLight)

    // 6. Grupo del Bloque 3D
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    // Dimensiones proporcionales del bloque
    const W = 9.0
    const D = 9.0 * aspect
    const segX = 72
    const segZ = 72
    const baseDepth = 2.6

    // Muestreo inicial de elevación (síncrono mientras carga el DEM de alta resolución)
    const grid = []
    let minElev = Infinity
    let maxElev = -Infinity

    for (let j = 0; j <= segZ; j++) {
      const v = j / segZ
      const lat = maxLat - v * (maxLat - minLat)
      for (let i = 0; i <= segX; i++) {
        const u = i / segX
        const lng = minLng + u * (maxLng - minLng)
        const elev = sampleElevation(lng, lat, elevationAt, map)
        if (elev < minElev) minElev = elev
        if (elev > maxElev) maxElev = elev
        grid.push(elev)
      }
    }

    elevationGridRef.current = grid
    elevationMinRef.current = minElev
    elevationMaxRef.current = maxElev
    const elevRange = Math.max(maxElev - minElev, 40)
    const heightScale = (2.8 / elevRange) * 2.0

    // --- A. Superficie Topográfica Superior ---
    const topGeom = new THREE.PlaneGeometry(W, D, segX, segZ)
    topGeom.rotateX(-Math.PI / 2)
    const topPos = topGeom.attributes.position

    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      const yVal = (e - minElev) * heightScale
      topPos.setY(k, yVal)
    }
    topPos.needsUpdate = true
    topGeom.computeVertexNormals()

    // Textura de la superficie (Captura real del mapa satélite o temático)
    let terrainTexture = null
    if (rectangle?.textureDataUrl) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = rectangle.textureDataUrl
      terrainTexture = new THREE.Texture(img)
      img.onload = () => {
        terrainTexture.needsUpdate = true
      }
    } else {
      terrainTexture = createFallbackTerrainTexture()
    }

    const topMat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      roughness: 0.72,
      metalness: 0.05,
      flatShading: false,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
    blockGroup.add(topMesh)
    topMeshRef.current = topMesh

    // --- B. Paredes Verticales de Falda con Estratigrafía Terrestre Realista ---
    const earthTexture = createEarthCrossSectionTexture()
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

        const yTopA = (getElevA(s) - minElev) * heightScale
        const yTopB = (getElevB(s + 1) - minElev) * heightScale
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
    addWall(
      -halfW, -halfD, halfW, -halfD,
      (s) => grid[s],
      (s) => grid[s],
      segX,
    )
    // Pared Este (+X)
    addWall(
      halfW, -halfD, halfW, halfD,
      (s) => grid[s * (segX + 1) + segX],
      (s) => grid[s * (segX + 1) + segX],
      segZ,
    )
    // Pared Sur (+Z)
    addWall(
      halfW, halfD, -halfW, halfD,
      (s) => grid[segZ * (segX + 1) + (segX - s)],
      (s) => grid[segZ * (segX + 1) + (segX - s)],
      segX,
    )
    // Pared Oeste (-X)
    addWall(
      -halfW, halfD, -halfW, -halfD,
      (s) => grid[(segZ - s) * (segX + 1)],
      (s) => grid[(segZ - s) * (segX + 1)],
      segZ,
    )

    const wallGeom = new THREE.BufferGeometry()
    wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3))
    wallGeom.setAttribute("uv", new THREE.Float32BufferAttribute(wallUVs, 2))
    wallGeom.computeVertexNormals()

    const wallMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.82,
      metalness: 0.04,
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
      color: 0x221a14,
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

    // --- E. Marcador / Pin 3D estilo infografía física ---
    const pinGroup = new THREE.Group()
    const pinPoleGeom = new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8)
    const pinPoleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.2 })
    const pinPole = new THREE.Mesh(pinPoleGeom, pinPoleMat)
    pinPole.position.y = 0.7
    pinGroup.add(pinPole)

    const labelText = expedientCode || "Área Seleccionada"
    const pinSprite = createPinMarker(labelText)
    if (pinSprite) {
      pinSprite.position.y = 1.45
      pinGroup.add(pinSprite)
    }

    // Ubicar el pin en el centro superior del relieve
    const centerIdx = Math.floor(segZ / 2) * (segX + 1) + Math.floor(segX / 2)
    const centerElev = grid[centerIdx] ?? minElev
    const centerY = (centerElev - minElev) * heightScale
    pinGroup.position.set(0, centerY, 0)
    blockGroup.add(pinGroup)
    pinGroupRef.current = pinGroup

    // 7. Bucle de animación continuo
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      if (autoRotateRef.current && blockGroupRef.current) {
        blockGroupRef.current.rotation.y += 0.004
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
  }, [isOpen, aspect, maxLat, minLat, maxLng, minLng, studioTheme, elevationAt, expedientCode, map, rectangle?.textureDataUrl])

  // --- Carga Asíncrona del DEM Real (SRTM Oficial) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return

    let canceled = false
    const [minLng, minLat, maxLng, maxLat] = rectangle.bbox
    const span = Math.max(maxLng - minLng, maxLat - minLat)

    // Ajustar zoom según extensión territorial para descarga ultrarrápida
    let zoom = DEM_MAX_ZOOM // 13 (~19 m de celda)
    if (span > 0.4) zoom = 11
    else if (span > 0.18) zoom = 12

    const range = tileRangeFor({ west: minLng, east: maxLng, south: minLat, north: maxLat }, zoom)
    let tiles = tilesOf(range)
    if (tiles.length > 28 && zoom > 10) {
      zoom -= 1
      const r2 = tileRangeFor({ west: minLng, east: maxLng, south: minLat, north: maxLat }, zoom)
      tiles = tilesOf(r2)
    }

    loadMosaic(TERRAIN_TILE_TEMPLATE, tiles, range)
      .then(({ heights, missing }) => {
        if (canceled || missing === tiles.length) return

        const segX = 72
        const segZ = 72
        const realGrid = []
        let rMin = Infinity
        let rMax = -Infinity

        for (let j = 0; j <= segZ; j++) {
          const v = j / segZ
          const lat = maxLat - v * (maxLat - minLat)
          for (let i = 0; i <= segX; i++) {
            const u = i / segX
            const lng = minLng + u * (maxLng - minLng)
            const cell = cellInMosaic(lng, lat, range)
            let elev = null
            if (cell.col >= 0 && cell.col < range.cols && cell.row >= 0 && cell.row < range.rows) {
              const val = heights[cell.row * range.cols + cell.col]
              if (Number.isFinite(val) && val > -500 && val < 9000) {
                elev = val
              }
            }
            if (elev === null) {
              elev = sampleElevation(lng, lat, elevationAt, map)
            }
            if (elev < rMin) rMin = elev
            if (elev > rMax) rMax = elev
            realGrid.push(elev)
          }
        }

        elevationGridRef.current = realGrid
        elevationMinRef.current = rMin
        elevationMaxRef.current = rMax
        setDemLoaded(true)

        // Deformar la geometría existente con el DEM de verdad
        if (topMeshRef.current && wallsMeshRef.current) {
          const elevRange = Math.max(rMax - rMin, 40)
          const hScale = (2.8 / elevRange) * exaggeration

          const topPos = topMeshRef.current.geometry.attributes.position
          for (let k = 0; k < topPos.count; k++) {
            const e = realGrid[k] ?? rMin
            topPos.setY(k, (e - rMin) * hScale)
          }
          topPos.needsUpdate = true
          topMeshRef.current.geometry.computeVertexNormals()

          // Actualizar paredes laterales
          const wallPos = wallsMeshRef.current.geometry.attributes.position
          const baseDepth = 2.6
          let idx = 0

          function updateWallSeg(getElevA, getElevB, steps) {
            for (let s = 0; s < steps; s++) {
              const yTopA = (getElevA(s) - rMin) * hScale
              const yTopB = (getElevB(s + 1) - rMin) * hScale
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

          // Actualizar posición del marcador pin
          if (pinGroupRef.current) {
            const centerIdx = Math.floor(segZ / 2) * (segX + 1) + Math.floor(segX / 2)
            const cElev = realGrid[centerIdx] ?? rMin
            pinGroupRef.current.position.y = (cElev - rMin) * hScale
          }
        }
      })
      .catch(() => {
        // Fallback síncrono ya activo
      })

    return () => {
      canceled = true
    }
  }, [isOpen, rectangle?.bbox, exaggeration, elevationAt, map])

  // Actualización dinámica de textura superior al cambiar mapa base
  useEffect(() => {
    if (!topMeshRef.current || !rectangle?.textureDataUrl) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = rectangle.textureDataUrl
    img.onload = () => {
      const newTex = new THREE.Texture(img)
      newTex.needsUpdate = true
      if (topMeshRef.current) {
        topMeshRef.current.material.map = newTex
        topMeshRef.current.material.needsUpdate = true
      }
    }
  }, [rectangle?.textureDataUrl])

  // Actualización de exageración vertical
  useEffect(() => {
    if (!topMeshRef.current || !wallsMeshRef.current) return
    const grid = elevationGridRef.current
    if (!grid || grid.length === 0) return

    const minElev = elevationMinRef.current
    const maxElev = elevationMaxRef.current
    const elevRange = Math.max(maxElev - minElev, 40)
    const heightScale = (2.8 / elevRange) * exaggeration

    // Top
    const topPos = topMeshRef.current.geometry.attributes.position
    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      topPos.setY(k, (e - minElev) * heightScale)
    }
    topPos.needsUpdate = true
    topMeshRef.current.geometry.computeVertexNormals()

    // Paredes
    const wallPos = wallsMeshRef.current.geometry.attributes.position
    const baseDepth = 2.6
    const segX = 72
    const segZ = 72
    let idx = 0

    function updateWallSeg(getElevA, getElevB, steps) {
      for (let s = 0; s < steps; s++) {
        const yTopA = (getElevA(s) - minElev) * heightScale
        const yTopB = (getElevB(s + 1) - minElev) * heightScale
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

    if (pinGroupRef.current) {
      const centerIdx = Math.floor(segZ / 2) * (segX + 1) + Math.floor(segX / 2)
      const cElev = grid[centerIdx] ?? minElev
      pinGroupRef.current.position.y = (cElev - minElev) * heightScale
    }
  }, [exaggeration])

  // Actualización de ángulo solar y sombras
  const updateSunAngle = useCallback((deg, height = 18, intensity = 2.5, color = 0xfffaed) => {
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

  useEffect(() => {
    if (pinGroupRef.current) pinGroupRef.current.visible = showPin
  }, [showPin])

  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(13.5, 12, 14.5)
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
            ? "border-zinc-300/80 bg-white/80 text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
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
              title="Seleccionar o dibujar otro rectángulo en el mapa"
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

          {/* Toggle de tema de estudio (Diorama Claro vs Oscuro) */}
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

          {/* Toggle de pin / marcador 3D */}
          <button
            type="button"
            onClick={() => setShowPin((p) => !p)}
            title={showPin ? "Ocultar marcador 3D" : "Mostrar marcador 3D"}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              showPin
                ? isLight
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-emerald-500/60 bg-emerald-950/40 text-emerald-300"
                : isLight
                ? "border-zinc-300 bg-white/90 text-zinc-400 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleSnapshot}
            title="Exportar captura PNG en alta definición"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetCamera}
            title="Restablecer posición de cámara"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restaurar tamaño de pantalla dividida" : "Maximizar vista 3D"}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                isLight
                  ? "border-zinc-300 bg-white/90 text-zinc-700 hover:bg-zinc-100"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Cerrar bloque 3D del terreno"
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
              isLight
                ? "border-zinc-300 bg-white/90 text-zinc-500 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-900/60 hover:bg-rose-950/40 hover:text-rose-300"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenedor Three.js Canvas */}
      <div ref={containerRef} className="relative h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Barra de Controles Studio Inferior */}
      <div
        className={`absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-2xl transition-all ${
          isLight
            ? "border-zinc-300/80 bg-white/85 text-zinc-800 shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
            : "border-zinc-800/80 bg-[#09090b]/90 text-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
        }`}
      >
        {/* Control de Exageración Vertical */}
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] font-medium uppercase tracking-wider ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>
            Exageración:
          </span>
          <input
            type="range"
            min="1.0"
            max="5.0"
            step="0.2"
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
                  ? isLight
                    ? "bg-zinc-800 text-white font-semibold shadow-sm"
                    : "bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700"
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
                ? "border-indigo-500/60 bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
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
