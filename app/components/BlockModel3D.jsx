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
} from "lucide-react"

/**
 * Genera la textura de superficie topográfica a partir de la captura del mapa
 * o de un mapa de elevación y pendiente realista si no hay captura disponible.
 */
function createFallbackTerrainTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Gradiente base natural de terreno (Valle andino a roca de cumbre)
  const grad = ctx.createLinearGradient(0, 1024, 0, 0)
  grad.addColorStop(0, "#2d3728")
  grad.addColorStop(0.35, "#4a5d3e")
  grad.addColorStop(0.65, "#6b6255")
  grad.addColorStop(0.85, "#8a8175")
  grad.addColorStop(1, "#b5b0a8")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1024, 1024)

  // Grano sutil de suelo y roca
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
 * Función de elevación para el bloque según el rectángulo seleccionado
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

  // Elevación analítica realista basada en armónicos si aún no hay DEM disponible
  const x = (lng + 75.0) * 80.0
  const z = (lat - 6.0) * 80.0
  const r1 = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 450
  const r2 = Math.cos(x * 1.1 + z * 0.4) * 250
  const r3 = Math.sin((x - z) * 1.5) * 120
  return 1800 + r1 + r2 + r3
}

/**
 * Componente de Bloque 3D del Terreno
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
  const sunLightRef = useRef(null)
  const animFrameRef = useRef(null)

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

    // 1. Escena y Fondo Studio Obscuro
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x09090b)
    sceneRef.current = scene

    // 2. Cámara de perspectiva
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    camera.position.set(13, 11, 15)
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
    renderer.toneMappingExposure = 1.2
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Controles orbitales con amortiguación
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxPolarAngle = Math.PI / 2 + 0.04
    controls.minDistance = 4
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 5. Iluminación realista
    // Luz solar directa con sombras nítidas
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.8)
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
    sunLight.shadow.normalBias = 0.02
    scene.add(sunLight)
    sunLightRef.current = sunLight

    // Luz hemisférica (Cielo diurno y rebote terrestre)
    const hemiLight = new THREE.HemisphereLight(0xbde0fe, 0x1f1c19, 0.95)
    scene.add(hemiLight)

    // Luz de borde sutil
    const rimLight = new THREE.DirectionalLight(0x94a3b8, 0.4)
    rimLight.position.set(-14, 8, -12)
    scene.add(rimLight)

    // 6. Grupo del Bloque 3D
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    // Geometría del bloque
    const W = 9.0
    const D = 9.0 * aspect
    const segX = 48
    const segZ = 48
    const baseDepth = 2.8

    // Muestreo de la rejilla de elevación
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
    const elevRange = Math.max(maxElev - minElev, 50)
    const heightScale = (3.0 / elevRange) * 2.0 // Exageración inicial 2.0x

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

    // Textura de la superficie (Captura real del mapa o satélite)
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
      roughness: 0.78,
      metalness: 0.08,
      flatShading: false,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
    blockGroup.add(topMesh)
    topMeshRef.current = topMesh

    // --- B. Paredes Verticales de Falda (Pedestal sólido y limpio) ---
    // Textura sobria de pedestal mineral oscuro sin capas artificiales
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
      segX
    )
    // Pared Este (+X)
    addWall(
      halfW, -halfD, halfW, halfD,
      (s) => grid[s * (segX + 1) + segX],
      (s) => grid[s * (segX + 1) + segX],
      segZ
    )
    // Pared Sur (+Z)
    addWall(
      halfW, halfD, -halfW, halfD,
      (s) => grid[segZ * (segX + 1) + (segX - s)],
      (s) => grid[segZ * (segX + 1) + (segX - s)],
      segX
    )
    // Pared Oeste (-X)
    addWall(
      -halfW, halfD, -halfW, -halfD,
      (s) => grid[(segZ - s) * (segX + 1)],
      (s) => grid[(segZ - s) * (segX + 1)],
      segZ
    )

    const wallGeom = new THREE.BufferGeometry()
    wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3))
    wallGeom.setAttribute("uv", new THREE.Float32BufferAttribute(wallUVs, 2))
    wallGeom.computeVertexNormals()

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1c1d22,
      roughness: 0.88,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
    const wallsMesh = new THREE.Mesh(wallGeom, wallMat)
    wallsMesh.castShadow = true
    wallsMesh.receiveShadow = true
    blockGroup.add(wallsMesh)
    wallsMeshRef.current = wallsMesh

    // --- C. Base Plana Inferior ---
    const baseGeom = new THREE.PlaneGeometry(W, D)
    baseGeom.rotateX(Math.PI / 2)
    baseGeom.translate(0, -baseDepth, 0)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.95,
      metalness: 0.05,
    })
    const baseMesh = new THREE.Mesh(baseGeom, baseMat)
    baseMesh.receiveShadow = true
    blockGroup.add(baseMesh)

    // --- D. Suelo de Sombra Suave (Shadow Catcher) ---
    const floorGeom = new THREE.PlaneGeometry(35, 35)
    floorGeom.rotateX(-Math.PI / 2)
    floorGeom.translate(0, -baseDepth - 0.05, 0)
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.45 })
    const floorMesh = new THREE.Mesh(floorGeom, floorMat)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // Rejilla de referencia en la base
    const gridHelper = new THREE.GridHelper(26, 26, 0x3f3f46, 0x18181b)
    gridHelper.position.y = -baseDepth - 0.04
    scene.add(gridHelper)

    // 7. Bucle de animación
    let isRunning = true
    const animate = () => {
      if (!isRunning) return
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      if (autoRotateRef.current && blockGroupRef.current) {
        blockGroupRef.current.rotation.y += 0.003
      }
      renderer.render(scene, camera)
    }
    animate()

    let resizeObserver = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!containerRef.current || !renderer || !camera) return
        const nw = containerRef.current.clientWidth
        const nh = containerRef.current.clientHeight
        if (nw > 0 && nh > 0) {
          camera.aspect = nw / nh
          camera.updateProjectionMatrix()
          renderer.setSize(nw, nh)
        }
      })
      resizeObserver.observe(container)
    }

    return () => {
      isRunning = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (resizeObserver) resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      topGeom.dispose()
      topMat.dispose()
      wallGeom.dispose()
      wallMat.dispose()
      baseGeom.dispose()
      baseMat.dispose()
      floorGeom.dispose()
      floorMat.dispose()
      if (terrainTexture) terrainTexture.dispose()
    }
  }, [isOpen, rectangle, aspect, maxLat, minLat, maxLng, minLng, elevationAt, map])

  // Actualización dinámica de Exageración Vertical
  useEffect(() => {
    if (!topMeshRef.current || !wallsMeshRef.current) return
    const grid = elevationGridRef.current
    const minElev = elevationMinRef.current
    const maxElev = elevationMaxRef.current
    if (!grid.length) return

    const elevRange = Math.max(maxElev - minElev, 50)
    const heightScale = (3.0 / elevRange) * exaggeration

    // Actualizar superficie
    const topGeom = topMeshRef.current.geometry
    const topPos = topGeom.attributes.position
    for (let k = 0; k < topPos.count; k++) {
      const e = grid[k] ?? minElev
      topPos.setY(k, (e - minElev) * heightScale)
    }
    topPos.needsUpdate = true
    topGeom.computeVertexNormals()

    // Actualizar falda
    const wallGeom = wallsMeshRef.current.geometry
    const wallPos = wallGeom.attributes.position
    const W = 9.0
    const D = 9.0 * aspect
    const segX = 48
    const segZ = 48
    const baseDepth = 2.8
    let idx = 0

    function updateWall(p0x, p0z, p1x, p1z, getElevA, getElevB, steps) {
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

        wallPos.setXYZ(idx++, xA, yTopA, zA)
        wallPos.setXYZ(idx++, xA, yBot, zA)
        wallPos.setXYZ(idx++, xB, yTopB, zB)
        wallPos.setXYZ(idx++, xB, yTopB, zB)
        wallPos.setXYZ(idx++, xA, yBot, zA)
        wallPos.setXYZ(idx++, xB, yBot, zB)
      }
    }

    const halfW = W / 2
    const halfD = D / 2

    // Norte
    updateWall(-halfW, -halfD, halfW, -halfD, (s) => grid[s], (s) => grid[s], segX)
    // Este
    updateWall(halfW, -halfD, halfW, halfD, (s) => grid[s * (segX + 1) + segX], (s) => grid[s * (segX + 1) + segX], segZ)
    // Sur
    updateWall(halfW, halfD, -halfW, halfD, (s) => grid[segZ * (segX + 1) + (segX - s)], (s) => grid[segZ * (segX + 1) + (segX - s)], segX)
    // Oeste
    updateWall(-halfW, halfD, -halfW, -halfD, (s) => grid[(segZ - s) * (segX + 1)], (s) => grid[(segZ - s) * (segX + 1)], segZ)

    wallPos.needsUpdate = true
    wallGeom.computeVertexNormals()
  }, [exaggeration, aspect])

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
      updateSunAngle(120, 8, 2.4, 0xffedd5)
    } else if (preset === "noon") {
      updateSunAngle(45, 22, 3.0, 0xfffaed)
    } else if (preset === "sunset") {
      updateSunAngle(310, 5, 2.5, 0xfdba74)
    }
  }, [updateSunAngle])

  useEffect(() => {
    if (topMeshRef.current) topMeshRef.current.material.wireframe = wireframe
    if (wallsMeshRef.current) wallsMeshRef.current.material.wireframe = wireframe
  }, [wireframe])

  const handleResetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(13, 11, 15)
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

  return (
    <div className="relative h-full w-full bg-[#09090b] overflow-hidden flex flex-col select-none">
      {/* Barra de cabecera Studio */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-[#09090b]/85 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Square className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-100 tracking-tight">
                Bloque 3D del Terreno
              </span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                Relieve Real
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Área: {widthKm} km × {heightKm} km · Cota: {Math.round(elevationMinRef.current)} m a {Math.round(elevationMaxRef.current)} m
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
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-300 hover:border-emerald-500 hover:bg-emerald-900/40 transition-all active:scale-95"
            >
              <Square className="h-3.5 w-3.5" />
              <span>Cambiar área</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSnapshot}
            title="Exportar captura PNG en alta definición"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetCamera}
            title="Restablecer posición de cámara"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? "Restaurar tamaño de pantalla dividida" : "Maximizar vista 3D"}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
            >
              {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Cerrar bloque 3D del terreno"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-900/60 hover:bg-rose-950/40 hover:text-rose-300 transition-all active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenedor Three.js Canvas */}
      <div ref={containerRef} className="relative h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Barra de Controles Studio Inferior */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-[#09090b]/90 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
        {/* Control de Exageración Vertical */}
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Exageración:
          </span>
          <input
            type="range"
            min="1.0"
            max="5.0"
            step="0.2"
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
            className="h-1.5 w-24 accent-emerald-500 cursor-pointer bg-zinc-800 rounded-lg"
          />
          <span className="font-mono text-[11px] text-emerald-400 font-semibold w-8">
            {exaggeration.toFixed(1)}×
          </span>
        </div>

        {/* Presets de Iluminación Solar */}
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
          <Sun className="h-3.5 w-3.5 text-zinc-400 mr-1" />
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
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Control de Ángulo Solar Continuo */}
        <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
          <Compass className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[10.5px] text-zinc-400 font-medium">Luz:</span>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={sunAngle}
            onChange={(e) => updateSunAngle(parseInt(e.target.value))}
            className="h-1.5 w-20 accent-amber-500 cursor-pointer bg-zinc-800 rounded-lg"
            title="Girar posición del sol para ver sombras dinámicas"
          />
          <span className="font-mono text-[10.5px] text-zinc-300 w-8">{sunAngle}°</span>
        </div>

        {/* Giro continuo y Malla */}
        <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            title={autoRotate ? "Pausar rotación continua" : "Activar rotación continua"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
              autoRotate
                ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-300"
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
                ? "border-indigo-500/60 bg-indigo-950/40 text-indigo-300"
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
