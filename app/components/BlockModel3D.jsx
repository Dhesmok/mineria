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
import { tileRangeFor, tilesOf, cellInMosaic, demZoomFor } from "../utils/demTiles"
import { TERRAIN_TILE_TEMPLATE } from "../utils/mapStyles"

/**
 * Textura de tierra homogénea natural para las paredes laterales
 * (tierra compacta, elegante y uniforme sin franjas artificiales).
 */
function createHomogeneousEarthTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // 1. Tono base de tierra fértil y mineral homogénea
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, "#2d231c")   // Tono tierra oscuro superior
  grad.addColorStop(0.2, "#342a22") // Tierra compacta
  grad.addColorStop(0.8, "#322820") // Subsuelo
  grad.addColorStop(1, "#261e18")   // Base ligeramente más oscura
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 512, 512)

  // 2. Grano mineral fino y sutil de suelo natural
  for (let i = 0; i < 3000; i++) {
    const px = Math.random() * 512
    const py = Math.random() * 512
    const sz = 0.8 + Math.random() * 1.5
    const dark = Math.random() > 0.45
    ctx.fillStyle = dark ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.06)"
    ctx.fillRect(px, py, sz, sz)
  }

  // 3. Sutiles micro-fisuras verticales/horizontales muy tenues
  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = "rgba(0,0,0,0.04)"
    ctx.fillRect(0, y, 512, 1)
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
  grad.addColorStop(0, "#2d3728")
  grad.addColorStop(0.35, "#4a5d3e")
  grad.addColorStop(0.65, "#6b6255")
  grad.addColorStop(0.85, "#8a8175")
  grad.addColorStop(1, "#b5b0a8")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 1024)

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
 * Crea la etiqueta 2D del Pin (Tag blanco / estético con tipografía nítida)
 */
function createPinSprite(text, color = "#ffffff", textColor = "#0f172a") {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 76
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Fondo cápsula redondeada
  ctx.fillStyle = color
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(6, 6, 244, 64, 14); else ctx.rect?.(6, 6, 244, 64)
  ctx.fill?.()

  // Borde sutil
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(0,0,0,0.12)"
  ctx.stroke?.()

  // Texto
  ctx.fillStyle = textColor
  ctx.font = "bold 23px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text.slice(0, 15), 128, 38)

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.scale.set(1.8, 0.54, 1)
  return sprite
}

/**
 * Crea el objeto 3D de un Pin estilizado (aguja metálica + bolita en tierra + etiqueta)
 */
function buildPinMesh(pin) {
  const group = new THREE.Group()
  group.name = "pin_" + pin.id
  group.userData = { pinId: pin.id }

  // 1. Bolita de contacto en el suelo
  const dotGeom = new THREE.SphereGeometry(0.045, 12, 12)
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.2 })
  const dot = new THREE.Mesh(dotGeom, dotMat)
  dot.position.y = 0.02
  group.add(dot)

  // 2. Mástil / aguja metálica fina
  const needleHeight = 0.95
  const needleGeom = new THREE.CylinderGeometry(0.012, 0.012, needleHeight, 8)
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.15 })
  const needle = new THREE.Mesh(needleGeom, needleMat)
  needle.position.y = needleHeight / 2
  group.add(needle)

  // 3. Etiqueta / Sprite
  const sprite = createPinSprite(pin.text, pin.color || "#ffffff", pin.textColor || "#0f172a")
  if (sprite) {
    sprite.position.y = needleHeight + 0.3
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
  const centerLat = (minLat + maxLat) / 2
  const latRad = (centerLat * Math.PI) / 180
  const widthMeters = Math.max(10, (maxLng - minLng) * 111320 * Math.cos(latRad))
  const heightMeters = Math.max(10, (maxLat - minLat) * 110574)
  const aspect = Math.max(0.4, Math.min(2.5, heightMeters / (widthMeters || 1)))
  const widthKm = (widthMeters / 1000).toFixed(2)
  const heightKm = (heightMeters / 1000).toFixed(2)

  // Escala métrica 1:1 rigurosa
  // En Three.js el ancho horizontal es W = 9.0
  const W = 9.0
  const D = 9.0 * aspect
  const metersPerThreeUnit = widthMeters / W
  const baseDepth = 0.45 // Base corta y elegante, no profunda

  // Función de cálculo de altura métrica para un valor de elevación
  const computeHeight = useCallback((elev, minElev, exag) => {
    // Escala métrica verdadera: (elev - minElev) / metersPerThreeUnit * exageracion
    const rawUnits = (elev - minElev) / metersPerThreeUnit
    return Math.max(0, rawUnits * exag)
  }, [metersPerThreeUnit])

  // Inicialización de Three.js
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 600

    // 1. Escena
    const scene = new THREE.Scene()
    const bgColor = studioTheme === "light" ? 0xdfe6dc : 0x09090b
    scene.background = new THREE.Color(bgColor)
    sceneRef.current = scene

    // 2. Cámara
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    camera.position.set(13.5, 11, 14.5)
    cameraRef.current = camera

    // 3. Renderer
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

    // 4. Controles orbitales
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxPolarAngle = Math.PI / 2 + 0.02
    controls.minDistance = 3
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 5. Iluminación realista
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

    const hemiLight = new THREE.HemisphereLight(
      studioTheme === "light" ? 0xffffff : 0xbde0fe,
      studioTheme === "light" ? 0xc5cec2 : 0x1f1c19,
      studioTheme === "light" ? 1.1 : 0.9,
    )
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4)
    rimLight.position.set(-14, 10, -12)
    scene.add(rimLight)

    // 6. Grupo del Bloque 3D
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    const segX = 72
    const segZ = 72

    // Muestreo inicial de elevación
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

    // --- B. Paredes Verticales de Falda con Tierra Homogénea ---
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
      color: 0x1e1712,
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

  // Actualización dinámica de textura (ej. cuando se procesa la captura de alta resolución o cambia el mapa base)
  useEffect(() => {
    if (!rectangle?.textureDataUrl || !topMeshRef.current?.material) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = rectangle.textureDataUrl
    img.onload = () => {
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
  }, [rectangle?.textureDataUrl])

  // --- Carga Asíncrona del DEM Real (Mismo DEM SRTM de alta resolución que usa el visor) ---
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return

    let canceled = false
    const [minLng, minLat, maxLng, maxLat] = rectangle.bbox

    // Obtener el mismo zoom que el visor
    const currentMapZoom = map?.getZoom?.() ?? 13
    const zoom = demZoomFor(currentMapZoom)

    const range = tileRangeFor({ west: minLng, east: maxLng, south: minLat, north: maxLat }, zoom)
    let tiles = tilesOf(range)

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

        // Deformar la geometría con el DEM de verdad
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
        // Fallback síncrono activo
      })

    return () => {
      canceled = true
    }
  }, [isOpen, rectangle?.bbox, exaggeration, elevationAt, map, computeHeight])

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
    const segX = 72
    const segZ = 72

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

  // Sincronizar pines en el grupo Three.js
  useEffect(() => {
    if (!pinsGroupRef.current) return
    const group = pinsGroupRef.current
    // Limpiar pines existentes
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

        // Coordenadas relativas en la cuadrícula
        const halfW = W / 2
        const halfD = D / 2
        const u = Math.max(0, Math.min(1, (p.x + halfW) / W))
        const v = Math.max(0, Math.min(1, (p.z + halfD) / D))

        const lng = minLng + u * (maxLng - minLng)
        const lat = maxLat - v * (maxLat - minLat)

        // Cota real en el punto
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
          color: "#ffffff",
          textColor: "#0f172a",
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

      {/* Editor flotante de Pin Seleccionado */}
      {selectedPin && (
        <div
          className={`absolute top-16 right-4 z-30 flex items-center gap-2 rounded-2xl border p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 ${
            isLight
              ? "border-zinc-300 bg-white/95 text-zinc-800"
              : "border-zinc-800 bg-[#09090b]/95 text-zinc-100"
          }`}
        >
          <div className="flex items-center gap-1.5 pl-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono text-zinc-400">
              {selectedPin.elev}m
            </span>
          </div>
          <input
            type="text"
            value={editingPinText}
            onChange={(e) => setEditingPinText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPins((prev) =>
                  prev.map((p) =>
                    p.id === selectedPin.id ? { ...p, text: editingPinText } : p
                  )
                )
                setSelectedPinId(null)
              }
            }}
            placeholder="Nombre del pin..."
            className={`h-7 w-32 rounded-lg border px-2 text-xs focus:outline-none ${
              isLight
                ? "border-zinc-300 bg-zinc-50 text-zinc-800 focus:border-zinc-400"
                : "border-zinc-800 bg-zinc-900 text-zinc-100 focus:border-zinc-700"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              setPins((prev) =>
                prev.map((p) =>
                  p.id === selectedPin.id ? { ...p, text: editingPinText } : p
                )
              )
              setSelectedPinId(null)
            }}
            title="Guardar texto del pin"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPins((prev) => prev.filter((p) => p.id !== selectedPin.id))
              setSelectedPinId(null)
            }}
            title="Eliminar este pin"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Banner de instrucción para colocar pin */}
      {isAddingPin && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border border-amber-500/50 bg-[#09090b]/95 px-4 py-1.5 text-xs text-amber-300 shadow-xl backdrop-blur-xl animate-in fade-in">
          <MapPin className="h-3.5 w-3.5 animate-bounce text-amber-400" />
          <span>Haz clic sobre cualquier cumbre, valle o punto del relieve para insertar el pin</span>
        </div>
      )}

      {/* Contenedor Three.js Canvas */}
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
