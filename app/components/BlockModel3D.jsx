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
  Scissors,
  Sun,
  Layers,
  Grid3X3,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

/**
 * Paleta de estratigrafía geológica realista
 */
const STRATA_DEFS = [
  { id: "soil", name: "Depósitos Cuaternarios / Suelo", depth: "0 - 40 m", color: "#453229", border: "#291e18" },
  { id: "sandstone_sup", name: "Areniscas Superiores", depth: "40 - 220 m", color: "#c29b62", border: "#937243" },
  { id: "shale", name: "Lodolitas y Lutitas Negras", depth: "220 - 450 m", color: "#3f3f46", border: "#27272a" },
  { id: "limestone", name: "Calizas Fosilíferas", depth: "450 - 680 m", color: "#d6d3d1", border: "#a8a29e" },
  { id: "ore_vein", name: "Veta Aurífera / Zona Mineralizada", depth: "680 - 750 m", color: "#eab308", border: "#ca8a04", isOre: true },
  { id: "sandstone_inf", name: "Areniscas y Conglomerados", depth: "750 - 1100 m", color: "#9a3412", border: "#7c2d12" },
  { id: "basement", name: "Basamento Cristalino Ígneo", depth: "> 1100 m", color: "#1e293b", border: "#0f172a" },
]

/**
 * Genera una textura procedural en alta resolución para los muros de corte estratigráficos
 */
function createProceduralStrataTexture() {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Fondo base
  ctx.fillStyle = "#18181b"
  ctx.fillRect(0, 0, 1024, 1024)

  const layers = [
    { y0: 0, y1: 60, colorA: "#453229", colorB: "#34241d", grain: 20 },
    { y0: 60, y1: 240, colorA: "#c29b62", colorB: "#ab854f", grain: 50, bedding: true },
    { y0: 240, y1: 450, colorA: "#383840", colorB: "#2b2b32", grain: 15, bedding: true },
    { y0: 450, y1: 630, colorA: "#d6d3d1", colorB: "#b8b4b1", grain: 30, joints: true },
    { y0: 630, y1: 710, colorA: "#eab308", colorB: "#ca8a04", ore: true },
    { y0: 710, y1: 880, colorA: "#9a3412", colorB: "#7c2d12", grain: 45, bedding: true },
    { y0: 880, y1: 1024, colorA: "#1e293b", colorB: "#0f172a", crystalline: true },
  ]

  layers.forEach((layer) => {
    const grad = ctx.createLinearGradient(0, layer.y0, 0, layer.y1)
    grad.addColorStop(0, layer.colorA)
    grad.addColorStop(1, layer.colorB)
    ctx.fillStyle = grad
    ctx.fillRect(0, layer.y0, 1024, layer.y1 - layer.y0)

    // Líneas sedimentarias de estratificación
    if (layer.bedding) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)"
      ctx.lineWidth = 1.5
      for (let y = layer.y0 + 10; y < layer.y1; y += 8 + (y % 7)) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        for (let x = 0; x <= 1024; x += 32) {
          ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2)
        }
        ctx.stroke()
      }
    }

    // Fracturas en calizas
    if (layer.joints) {
      ctx.strokeStyle = "rgba(255,255,255,0.25)"
      ctx.lineWidth = 1
      for (let x = 40; x < 1024; x += 65 + (x % 30)) {
        ctx.beginPath()
        ctx.moveTo(x, layer.y0)
        ctx.lineTo(x + (x % 20) - 10, layer.y1)
        ctx.stroke()
      }
    }

    // Zona mineralizada / Veta de oro
    if (layer.ore) {
      const oreGrad = ctx.createLinearGradient(0, layer.y0, 0, layer.y1)
      oreGrad.addColorStop(0, "#ca8a04")
      oreGrad.addColorStop(0.5, "#fef08a")
      oreGrad.addColorStop(1, "#a16207")
      ctx.fillStyle = oreGrad
      ctx.fillRect(0, layer.y0 + 20, 1024, 40)

      ctx.fillStyle = "#ffffff"
      for (let i = 0; i < 120; i++) {
        const px = (i * 37) % 1024
        const py = layer.y0 + 15 + ((i * 19) % 50)
        ctx.fillRect(px, py, 2.5, 2.5)
      }
    }

    // Textura cristalina (granito/gneiss)
    if (layer.crystalline) {
      for (let i = 0; i < 400; i++) {
        const px = (i * 53) % 1024
        const py = layer.y0 + ((i * 41) % (layer.y1 - layer.y0))
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.3)"
        ctx.fillRect(px, py, 3, 3)
      }
    }

    // Línea divisoria de estrato
    ctx.strokeStyle = "rgba(0,0,0,0.4)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, layer.y1)
    ctx.lineTo(1024, layer.y1)
    ctx.stroke()
  })

  // Escala métrica vertical a la izquierda
  ctx.fillStyle = "rgba(255,255,255,0.85)"
  ctx.font = "bold 18px monospace"
  const ticks = [
    { y: 15, text: "0 m" },
    { y: 150, text: "-150 m" },
    { y: 340, text: "-350 m" },
    { y: 540, text: "-550 m" },
    { y: 670, text: "VETA (Au)" },
    { y: 800, text: "-800 m" },
    { y: 980, text: "-1200 m" },
  ]
  ticks.forEach((t) => {
    ctx.strokeStyle = "rgba(255,255,255,0.6)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, t.y)
    ctx.lineTo(25, t.y)
    ctx.stroke()
    ctx.fillText(t.text, 32, t.y + 6)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

/**
 * Función analítica de elevación topográfica
 */
function elevationSample(x, z) {
  const d = Math.sqrt(x * x + z * z)
  const ridge1 = Math.sin(x * 0.45) * Math.cos(z * 0.45) * 1.8
  const ridge2 = Math.cos(x * 0.85 + z * 0.3) * 0.75
  const ridge3 = Math.sin((x - z) * 1.1) * 0.35
  const valley = -Math.exp(-(d * d) / 18) * 1.2
  return (ridge1 + ridge2 + ridge3 + valley) * 0.7 + 1.2
}

/**
 * Componente Estudio de Bloque 3D Geológico (Forge3D)
 */
export default function BlockModel3D({
  isOpen,
  onClose,
  expedientCode,
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
  const oreVeinRef = useRef(null)
  const clipPlaneRef = useRef(null)
  const sunLightRef = useRef(null)
  const animFrameRef = useRef(null)

  // Estados interactivos del estudio 3D
  const [exaggeration, setExaggeration] = useState(2.0)
  const [slicingActive, setSlicingActive] = useState(false)
  const [slicePosition, setSlicePosition] = useState(0)
  const [sunPreset, setSunPreset] = useState("noon")
  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])
  const [wireframe, setWireframe] = useState(false)
  const [showStrataLegend, setShowStrataLegend] = useState(true)

  // Inicialización de Three.js
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 600
    const height = container.clientHeight || 600

    // 1. Escena y Fondo Studio
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x09090b)
    sceneRef.current = scene

    // 2. Cámara de perspectiva
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
    camera.position.set(13, 11, 15)
    cameraRef.current = camera

    // 3. Renderer con Sombras Suaves PCF y ACES Filmic Tone Mapping
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
    renderer.toneMappingExposure = 1.25
    renderer.localClippingEnabled = true
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. OrbitControls con amortiguación suave
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 + 0.05
    controls.minDistance = 5
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 5. Iluminación realista estilo Forge3D
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.5)
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
    sunLight.shadow.bias = -0.0005
    sunLight.shadow.normalBias = 0.02
    scene.add(sunLight)
    sunLightRef.current = sunLight

    const hemiLight = new THREE.HemisphereLight(0xb1d4f0, 0x221c1a, 0.9)
    scene.add(hemiLight)

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4)
    rimLight.position.set(-15, 8, -12)
    scene.add(rimLight)

    // 6. Plano de corte (Clipping Plane)
    const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100)
    clipPlaneRef.current = clipPlane

    // 7. Grupo del Modelo de Bloque
    const blockGroup = new THREE.Group()
    scene.add(blockGroup)
    blockGroupRef.current = blockGroup

    const W = 9
    const D = 9
    const segX = 48
    const segZ = 48
    const baseDepth = 4.2

    // Topografía
    const topGeom = new THREE.PlaneGeometry(W, D, segX, segZ)
    topGeom.rotateX(-Math.PI / 2)

    const topPos = topGeom.attributes.position
    const count = topPos.count
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const x = topPos.getX(i)
      const z = topPos.getZ(i)
      const elev = elevationSample(x, z)
      topPos.setY(i, elev * 2.0)

      const t = Math.max(0, Math.min(1, (elev - 0.2) / 2.6))
      let r, g, b
      if (t < 0.35) {
        r = 0.12 + t * 0.3
        g = 0.45 + t * 0.4
        b = 0.18 + t * 0.15
      } else if (t < 0.7) {
        const s = (t - 0.35) / 0.35
        r = 0.35 + s * 0.3
        g = 0.42 + s * 0.05
        b = 0.22 - s * 0.05
      } else {
        const s = (t - 0.7) / 0.3
        r = 0.55 + s * 0.32
        g = 0.54 + s * 0.32
        b = 0.52 + s * 0.35
      }
      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }

    topGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    topGeom.computeVertexNormals()

    const topMat = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.05,
      vertexColors: true,
      clippingPlanes: [clipPlane],
      clipShadows: true,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
    blockGroup.add(topMesh)
    topMeshRef.current = topMesh

    // Paredes de falda estratigráficas
    const strataTex = createProceduralStrataTexture()
    const wallMat = new THREE.MeshStandardMaterial({
      map: strataTex,
      roughness: 0.65,
      metalness: 0.12,
      clippingPlanes: [clipPlane],
      clipShadows: true,
      side: THREE.DoubleSide,
    })

    const wallPositions = []
    const wallUVs = []

    function addWall(p0x, p0z, p1x, p1z, steps) {
      for (let s = 0; s < steps; s++) {
        const uA = s / steps
        const uB = (s + 1) / steps
        const xA = p0x + (p1x - p0x) * uA
        const zA = p0z + (p1z - p0z) * uA
        const xB = p0x + (p1x - p0x) * uB
        const zB = p0z + (p1z - p0z) * uB

        const yTopA = elevationSample(xA, zA) * 2.0
        const yTopB = elevationSample(xB, zB) * 2.0
        const yBot = -baseDepth

        wallPositions.push(xA, yTopA, zA, xA, yBot, zA, xB, yTopB, zB)
        wallPositions.push(xB, yTopB, zB, xA, yBot, zA, xB, yBot, zB)

        const vTopA = (yTopA + baseDepth) / (4.0 + baseDepth)
        const vTopB = (yTopB + baseDepth) / (4.0 + baseDepth)
        wallUVs.push(uA, vTopA, uA, 0, uB, vTopB)
        wallUVs.push(uB, vTopB, uA, 0, uB, 0)
      }
    }

    const halfW = W / 2
    const halfD = D / 2
    addWall(-halfW, halfD, halfW, halfD, segX)
    addWall(halfW, halfD, halfW, -halfD, segZ)
    addWall(halfW, -halfD, -halfW, -halfD, segX)
    addWall(-halfW, -halfD, -halfW, halfD, segZ)

    const wallGeom = new THREE.BufferGeometry()
    wallGeom.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3))
    wallGeom.setAttribute("uv", new THREE.Float32BufferAttribute(wallUVs, 2))
    wallGeom.computeVertexNormals()

    const wallsMesh = new THREE.Mesh(wallGeom, wallMat)
    wallsMesh.castShadow = true
    wallsMesh.receiveShadow = true
    blockGroup.add(wallsMesh)
    wallsMeshRef.current = wallsMesh

    // Base
    const baseGeom = new THREE.PlaneGeometry(W, D)
    baseGeom.rotateX(Math.PI / 2)
    baseGeom.translate(0, -baseDepth, 0)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
      metalness: 0.1,
      clippingPlanes: [clipPlane],
    })
    const baseMesh = new THREE.Mesh(baseGeom, baseMat)
    baseMesh.receiveShadow = true
    blockGroup.add(baseMesh)

    // Veta Mineralizada 3D Interior
    const oreGeom = new THREE.CylinderGeometry(0.35, 0.7, 8.5, 32, 16)
    oreGeom.rotateZ(Math.PI / 3.2)
    oreGeom.rotateY(Math.PI / 5)
    oreGeom.translate(0, -1.2, 0)
    const oreMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0x854d0e,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.88,
      clippingPlanes: [clipPlane],
      clipShadows: true,
    })
    const oreMesh = new THREE.Mesh(oreGeom, oreMat)
    oreMesh.castShadow = true
    blockGroup.add(oreMesh)
    oreVeinRef.current = oreMesh

    // Sombra en suelo
    const floorGeom = new THREE.PlaneGeometry(35, 35)
    floorGeom.rotateX(-Math.PI / 2)
    floorGeom.translate(0, -baseDepth - 0.05, 0)
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.45 })
    const floorMesh = new THREE.Mesh(floorGeom, floorMat)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    const grid = new THREE.GridHelper(26, 26, 0x3f3f46, 0x18181b)
    grid.position.y = -baseDepth - 0.04
    scene.add(grid)

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
      oreGeom.dispose()
      oreMat.dispose()
      floorGeom.dispose()
      floorMat.dispose()
      if (strataTex) strataTex.dispose()
    }
  }, [isOpen])

  // Actualización de Exageración Vertical
  useEffect(() => {
    if (!topMeshRef.current || !wallsMeshRef.current) return
    const topGeom = topMeshRef.current.geometry
    const topPos = topGeom.attributes.position
    const count = topPos.count

    for (let i = 0; i < count; i++) {
      const x = topPos.getX(i)
      const z = topPos.getZ(i)
      topPos.setY(i, elevationSample(x, z) * exaggeration)
    }
    topPos.needsUpdate = true
    topGeom.computeVertexNormals()

    const wallGeom = wallsMeshRef.current.geometry
    const wallPos = wallGeom.attributes.position
    const W = 9
    const D = 9
    const segX = 48
    const segZ = 48
    const baseDepth = 4.2
    let idx = 0

    function updateWallVertices(p0x, p0z, p1x, p1z, steps) {
      for (let s = 0; s < steps; s++) {
        const uA = s / steps
        const uB = (s + 1) / steps
        const xA = p0x + (p1x - p0x) * uA
        const zA = p0z + (p1z - p0z) * uA
        const xB = p0x + (p1x - p0x) * uB
        const zB = p0z + (p1z - p0z) * uB

        const yTopA = elevationSample(xA, zA) * exaggeration
        const yTopB = elevationSample(xB, zB) * exaggeration
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
    updateWallVertices(-halfW, halfD, halfW, halfD, segX)
    updateWallVertices(halfW, halfD, halfW, -halfD, segZ)
    updateWallVertices(halfW, -halfD, -halfW, -halfD, segX)
    updateWallVertices(-halfW, -halfD, -halfW, halfD, segZ)

    wallPos.needsUpdate = true
    wallGeom.computeVertexNormals()
  }, [exaggeration])

  // Plano de corte
  useEffect(() => {
    if (!clipPlaneRef.current) return
    if (slicingActive) {
      clipPlaneRef.current.normal.set(-1, 0, 0)
      clipPlaneRef.current.constant = slicePosition
    } else {
      clipPlaneRef.current.constant = 100
    }
  }, [slicingActive, slicePosition])

  const changeSunPreset = useCallback((preset) => {
    setSunPreset(preset)
    if (!sunLightRef.current) return
    if (preset === "morning") {
      sunLightRef.current.position.set(-16, 8, 12)
      sunLightRef.current.color.setHex(0xffedd5)
      sunLightRef.current.intensity = 2.0
    } else if (preset === "noon") {
      sunLightRef.current.position.set(4, 22, 6)
      sunLightRef.current.color.setHex(0xfffaed)
      sunLightRef.current.intensity = 2.6
    } else if (preset === "sunset") {
      sunLightRef.current.position.set(18, 5, -12)
      sunLightRef.current.color.setHex(0xfdba74)
      sunLightRef.current.intensity = 2.2
    }
  }, [])

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
    a.download = `bloque_geologico_3d_${expedientCode || "modelo"}.png`
    a.click()
  }, [expedientCode])

  if (!isOpen) return null

  return (
    <div className="relative h-full w-full bg-[#09090b] overflow-hidden flex flex-col select-none">
      {/* Barra de cabecera Studio */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-[#09090b]/85 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-100 tracking-tight">
                Modelo Geológico 3D (Forge3D)
              </span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                PBR Realista
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {expedientCode ? `Expediente: ${expedientCode} · ` : ""}
              Estratigrafía procedural, relieve analítico y veta mineralizada
            </p>
          </div>
        </div>

        {/* Acciones de cabecera */}
        <div className="flex items-center gap-1.5">
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
            title="Cerrar modelo de bloque 3D"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-rose-900/60 hover:bg-rose-950/40 hover:text-rose-300 transition-all active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenedor Three.js Canvas */}
      <div ref={containerRef} className="relative h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Leyenda Estratigráfica Lateral Colapsable */}
      <div className="absolute top-20 left-3 z-20 max-w-[240px]">
        <div className="rounded-2xl border border-zinc-800/80 bg-[#09090b]/85 p-3 shadow-2xl backdrop-blur-2xl transition-all">
          <button
            type="button"
            onClick={() => setShowStrataLegend((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
          >
            <span>Columna Estratigráfica</span>
            {showStrataLegend ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showStrataLegend && (
            <div className="mt-2.5 space-y-1.5 border-t border-zinc-800/60 pt-2 text-[11px]">
              {STRATA_DEFS.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg p-1.5 transition-colors ${
                    s.isOre ? "bg-amber-500/10 border border-amber-500/30" : "hover:bg-zinc-800/40"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded border shadow-sm"
                    style={{ backgroundColor: s.color, borderColor: s.border }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium ${s.isOre ? "text-amber-300 font-semibold" : "text-zinc-200"}`}>
                      {s.name}
                    </div>
                    <div className="text-[9.5px] text-zinc-400 font-mono">{s.depth}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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

        {/* Control de Plano de Corte (Slicing) */}
        <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
          <button
            type="button"
            onClick={() => setSlicingActive((v) => !v)}
            title="Activar plano de corte transversal para ver el interior del bloque"
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-medium transition-all ${
              slicingActive
                ? "border-amber-500/60 bg-amber-950/40 text-amber-300 shadow-sm"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Scissors className="h-3.5 w-3.5" />
            <span>Corte interior</span>
          </button>

          {slicingActive && (
            <input
              type="range"
              min="-4.0"
              max="4.0"
              step="0.2"
              value={slicePosition}
              onChange={(e) => setSlicePosition(parseFloat(e.target.value))}
              className="h-1.5 w-20 accent-amber-500 cursor-pointer bg-zinc-800 rounded-lg"
              title="Mover plano de corte transversal"
            />
          )}
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
