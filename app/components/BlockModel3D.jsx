"use client"

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react"
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
  Cloud,
  Wind,
} from "lucide-react"
import { TILE_SIZE } from "../utils/demTiles"

/**
 * Shaders GLSL 3.0 para Raymarching Volumétrico 3D de Nubes Atmosféricas
 * Inspirado en la implementación de nubes volumétricas geoespaciales (como sfv-3d-labels y Three.js Volume Cloud).
 */
const VOLUMETRIC_CLOUD_VERTEX_SHADER = /* glsl */ `
in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPos;

out vec3 vOrigin;
out vec3 vDirection;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
}
`

const VOLUMETRIC_CLOUD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
precision highp sampler3D;

in vec3 vOrigin;
in vec3 vDirection;

out vec4 color;

uniform sampler3D map;
uniform vec3 baseColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform float threshold;
uniform float range;
uniform float opacity;
uniform float steps;
uniform vec3 windOffset;
uniform float frame;

uint wang_hash(uint seed) {
    seed = (seed ^ 61u) ^ (seed >> 16u);
    seed *= 9u;
    seed = seed ^ (seed >> 4u);
    seed *= 0x27d4eb2du;
    seed = seed ^ (seed >> 15u);
    return seed;
}

float randomFloat(inout uint seed) {
    return float(wang_hash(seed)) / 4294967296.0;
}

vec2 hitBox( vec3 orig, vec3 dir ) {
    const vec3 box_min = vec3( - 0.5 );
    const vec3 box_max = vec3( 0.5 );
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
    vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
    vec3 tmin = min( tmin_tmp, tmax_tmp );
    vec3 tmax = max( tmin_tmp, tmax_tmp );
    float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
    float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
    return vec2( t0, t1 );
}

void main() {
    vec3 rayDir = normalize( vDirection );
    vec2 bounds = hitBox( vOrigin, rayDir );

    if ( bounds.x > bounds.y ) discard;

    bounds.x = max( bounds.x, 0.0 );
    float distanceInBox = bounds.y - bounds.x;
    if ( distanceInBox <= 0.0 ) discard;

    float stepSize = distanceInBox / steps;

    // Dithering estocástico para eliminar bandas de muestreo
    uint seed = uint( gl_FragCoord.x ) * uint( 1973 ) + uint( gl_FragCoord.y ) * uint( 9277 ) + uint( frame ) * uint( 26699 );
    float randNum = randomFloat( seed );
    vec3 p = vOrigin + ( bounds.x + randNum * stepSize ) * rayDir;

    vec3 lDir = normalize( sunDirection );
    float cosTheta = dot( rayDir, lDir );
    float forwardScatter = 0.5 + 0.5 * cosTheta * cosTheta;

    vec4 ac = vec4( 0.0 );

    for ( float i = 0.0; i < steps; i += 1.0 ) {
        vec3 coord = fract( p + 0.5 + windOffset );
        float d = texture( map, coord ).r;

        d = smoothstep( threshold - range, threshold + range, d );

        if ( d > 0.001 ) {
            // Sombra interna y dispersión de luz solar en el volumen
            float shadowSample = texture( map, fract( coord + lDir * 0.035 ) ).r;
            float shadow = clamp( 1.0 - ( shadowSample - d ) * 2.8, 0.25, 1.0 );

            vec3 stepColor = mix( baseColor, sunColor, shadow * forwardScatter );
            float stepAlpha = ( 1.0 - ac.a ) * d * opacity;

            ac.rgb += stepColor * stepAlpha;
            ac.a += stepAlpha;

            if ( ac.a >= 0.95 ) break;
        }

        p += rayDir * stepSize;
    }

    if ( ac.a <= 0.01 ) discard;
    color = ac;
}
`

/**
 * Genera una textura 3D real (Data3DTexture) de ruido fractal Perlin para simulación volumétrica
 */
function createVolumetricCloud3DTexture() {
  if (typeof THREE.Data3DTexture !== "function") return null

  const size = 64
  const data = new Uint8Array(size * size * size)

  const p = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
  ]
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) {
    perm[i] = p[i]
    perm[256 + i] = p[i]
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (t, a, b) => a + t * (b - a)
  const grad = (hash, x, y, z) => {
    const h = hash & 15
    const u = h < 8 ? x : y
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  const perlin3D = (x, y, z) => {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const Z = Math.floor(z) & 255
    const fx = x - Math.floor(x)
    const fy = y - Math.floor(y)
    const fz = z - Math.floor(z)
    const u = fade(fx)
    const v = fade(fy)
    const w = fade(fz)
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z

    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(perm[AA], fx, fy, fz), grad(perm[BA], fx - 1, fy, fz)),
        lerp(u, grad(perm[AB], fx, fy - 1, fz), grad(perm[BB], fx - 1, fy - 1, fz))
      ),
      lerp(
        v,
        lerp(u, grad(perm[AA + 1], fx, fy, fz - 1), grad(perm[BA + 1], fx - 1, fy, fz - 1)),
        lerp(u, grad(perm[AB + 1], fx, fy - 1, fz - 1), grad(perm[BB + 1], fx - 1, fy - 1, fz - 1))
      )
    )
  }

  let idx = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Ruido fractal fBm de 3 octavas 3D
        const n1 = perlin3D(x * 0.06, y * 0.09, z * 0.06)
        const n2 = perlin3D(x * 0.12, y * 0.18, z * 0.12) * 0.5
        const n3 = perlin3D(x * 0.24, y * 0.36, z * 0.24) * 0.25
        let total = (n1 + n2 + n3) / 1.75

        // Atenuación vertical para base plana y copas redondeadas de cúmulos
        const ny = (y / size) * 2.0 - 1.0
        const verticalShape = Math.max(0, 1.0 - ny * ny)
        total = Math.max(0, (total * 0.5 + 0.5) * verticalShape)

        data[idx++] = Math.floor(Math.min(255, total * 255))
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size)
  texture.format = THREE.RedFormat
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.unpackAlignment = 1
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.wrapR = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

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
function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== "string") return `rgba(234, 179, 8, ${alpha})`
  let clean = hex.replace("#", "")
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("")
  }
  const num = parseInt(clean, 16)
  if (isNaN(num)) return `rgba(234, 179, 8, ${alpha})`
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function drawPolygon(ctx, rings, projectPoint) {
  if (!rings || rings.length === 0) return
  ctx.beginPath()
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    for (let i = 0; i < ring.length; i++) {
      const [px, py] = projectPoint(ring[i][0], ring[i][1])
      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
}

function drawLineString(ctx, coords, projectPoint) {
  if (!coords || coords.length === 0) return
  ctx.beginPath()
  for (let i = 0; i < coords.length; i++) {
    const [px, py] = projectPoint(coords[i][0], coords[i][1])
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.stroke()
}

function drawVectorLayersOnCanvas(ctx, canvasW, canvasH, bbox, activeVectors) {
  if (!ctx || !activeVectors || activeVectors.length === 0 || !bbox) return
  const [minLng, minLat, maxLng, maxLat] = bbox

  const lat2normY = (lat) => {
    const sin = Math.sin((lat * Math.PI) / 180)
    const clampedSin = Math.max(-0.9999, Math.min(0.9999, sin))
    return (1 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (2 * Math.PI)) / 2
  }

  const bNorthY = lat2normY(maxLat)
  const bSouthY = lat2normY(minLat)
  const normYHeight = bSouthY - bNorthY
  const lngWidth = maxLng - minLng
  if (normYHeight <= 0 || lngWidth <= 0) return

  const projectPoint = (lng, lat) => {
    const px = ((lng - minLng) / lngWidth) * canvasW
    const py = ((lat2normY(lat) - bNorthY) / normYHeight) * canvasH
    return [px, py]
  }

  for (const layer of activeVectors) {
    const strokeColor = layer.color || "#eab308"
    const opacity = typeof layer.opacity === "number" ? layer.opacity : 0.65
    const fillColor = hexToRgba(strokeColor, Math.max(0.18, Math.min(0.85, opacity * 0.55)))
    ctx.fillStyle = fillColor
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2.5
    ctx.lineJoin = "round"
    ctx.lineCap = "round"

    for (const feature of layer.features || []) {
      const geom = feature.geometry
      if (!geom) continue

      if (geom.type === "Polygon") {
        drawPolygon(ctx, geom.coordinates, projectPoint)
      } else if (geom.type === "MultiPolygon") {
        for (const polyCoords of geom.coordinates) {
          drawPolygon(ctx, polyCoords, projectPoint)
        }
      } else if (geom.type === "LineString") {
        drawLineString(ctx, geom.coordinates, projectPoint)
      } else if (geom.type === "MultiLineString") {
        for (const lineCoords of geom.coordinates) {
          drawLineString(ctx, lineCoords, projectPoint)
        }
      }
    }
  }
}

function getActiveVectorLayers(map, layerState, loadedFeatures = []) {
  const activeVectors = []
  const recordedKeys = new Set()

  if (layerState) {
    for (const [key, conf] of Object.entries(layerState)) {
      if (!conf?.on) continue
      recordedKeys.add(key)
      let fc = null
      if (map && typeof map.getSource === "function") {
        const possibleSourceIds = [`anm-${key}`, `sgc-${key}`, `anh-${key}`, key]
        for (const sid of possibleSourceIds) {
          try {
            const src = map.getSource(sid)
            if (src && src._data && src._data.features && src._data.features.length > 0) {
              fc = src._data
              break
            }
          } catch {}
        }
      }

      if (fc && fc.features && fc.features.length > 0) {
        activeVectors.push({
          key,
          color: conf.color || "#eab308",
          opacity: conf.opacity !== undefined ? conf.opacity : 0.65,
          features: fc.features,
        })
      }
    }
  }

  // Si hay loadedFeatures con geometría
  if (Array.isArray(loadedFeatures) && loadedFeatures.length > 0) {
    const byKey = {}
    for (const f of loadedFeatures) {
      if (f?.geometry && f.layerKey && !recordedKeys.has(f.layerKey)) {
        if (!byKey[f.layerKey]) byKey[f.layerKey] = []
        byKey[f.layerKey].push(f)
      }
    }
    for (const [k, feats] of Object.entries(byKey)) {
      const conf = layerState?.[k]
      activeVectors.push({
        key: k,
        color: conf?.color || "#38bdf8",
        opacity: conf?.opacity !== undefined ? conf.opacity : 0.65,
        features: feats,
      })
    }
  }

  // Resaltado de búsqueda si existe
  if (map && typeof map.getSource === "function") {
    try {
      const searchSrc = map.getSource("search-highlight") || map.getSource("expedient-highlight")
      if (searchSrc && searchSrc._data && searchSrc._data.features && searchSrc._data.features.length > 0) {
        activeVectors.push({
          key: "search-highlight",
          color: "#f43f5e",
          opacity: 0.85,
          features: searchSrc._data.features,
        })
      }
    } catch {}
  }

  return activeVectors
}

/**
 * Textura procedural de relieve hipsométrico suave
 */
function createReliefBasemapTexture(grid, segX, segZ, bbox = null, activeVectors = []) {
  if (typeof document === "undefined" || !grid || grid.length === 0) return null
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(512, segX + 1)
  canvas.height = Math.max(512, segZ + 1)
  const ctx = canvas.getContext("2d")
  if (!ctx || typeof ctx.createImageData !== "function") return null

  const imgData = ctx.createImageData(segX + 1, segZ + 1)
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

  const rawCanvas = document.createElement("canvas")
  rawCanvas.width = segX + 1
  rawCanvas.height = segZ + 1
  const rawCtx = rawCanvas.getContext("2d")
  if (rawCtx) {
    rawCtx.putImageData(imgData, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(rawCanvas, 0, 0, canvas.width, canvas.height)
  }

  if (activeVectors && activeVectors.length > 0 && bbox) {
    drawVectorLayersOnCanvas(ctx, canvas.width, canvas.height, bbox, activeVectors)
  }

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
 * Descarga y compone directamente las teselas de mapa base a resolución nativa ultra-nítida
 * y superpone vectorialmente todas las capas mineras y geológicas activas.
 */
async function loadHighResSatelliteCanvas(bbox, basemap = "satellite", activeVectors = []) {
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
      const s = ["a", "b", "c"][Math.abs((x + y) % 3)]
      return `https://${s}.tile.opentopomap.org/${z}/${x}/${y}.png`
    }
    if (basemap === "esri" || basemap === "esriImagery") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    }
    if (basemap === "positron" || basemap === "grayBase") {
      return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`
    }
    if (basemap === "googlePlain") {
      const s = Math.abs((x + y) % 4)
      return `https://mt${s}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`
    }
    // googleHybrid / satellite por defecto
    const s = Math.abs((x + y) % 4)
    return `https://mt${s}.google.com/vt/lyrs=s,h&x=${x}&y=${y}&z=${z}`
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

  // Dibuja las capas vectoriales activas recortadas al perímetro del bloque 3D
  if (activeVectors && activeVectors.length > 0) {
    drawVectorLayersOnCanvas(finalCtx, outW, outH, bbox, activeVectors)
  }

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
  map,
  basemap = "satellite",
  layerState,
  loadedFeatures,
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
  const cloudsGroupRef = useRef(null)
  const cloudsMatRef = useRef(null)
  const cloudsTextureRef = useRef(null)
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

  const [sunAngle, setSunAngle] = useState(180)
  const [autoRotate, setAutoRotate] = useState(false)
  const autoRotateRef = useRef(autoRotate)
  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  // Configuración de Nubes Realistas
  const [cloudsEnabled, setCloudsEnabled] = useState(false)
  const [cloudDensity, setCloudDensity] = useState(0.7)
  const [cloudHeightRatio, setCloudHeightRatio] = useState(1.2)
  const cloudsEnabledRef = useRef(false)
  useEffect(() => {
    cloudsEnabledRef.current = cloudsEnabled
  }, [cloudsEnabled])

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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.display = "block"

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

    // Iluminación hemisférica natural con relleno para valles
    const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0x52525b, 0.85)
    hemiLight.position.set(0, 50, 0)
    scene.add(hemiLight)
    hemiLightRef.current = hemiLight

    // Luz solar direccional potente con sombras suaves de alta definición
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.55)
    dirLight.position.set(0, 18, 0)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 60
    dirLight.shadow.camera.left = -12
    dirLight.shadow.camera.right = 12
    dirLight.shadow.camera.top = 12
    dirLight.shadow.camera.bottom = -12
    dirLight.shadow.bias = -0.0004
    dirLight.shadow.normalBias = 0.04
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
      roughness: 0.8,
      metalness: 0.05,
      flatShading: false,
    })
    const topMesh = new THREE.Mesh(topGeom, topMat)
    topMesh.castShadow = true
    topMesh.receiveShadow = true
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
    floorMeshRef.current = floorMesh

    // --- E. Grupo de Pines ---
    const pinsGroup = new THREE.Group()
    blockGroup.add(pinsGroup)
    pinsGroupRef.current = pinsGroup

    // --- F. Capa de Nubes Volumétricas 3D Reales (Raymarching en volumen 3D con dispersión solar) ---
    const cloudsGroup = new THREE.Group()
    cloudsGroup.visible = false
    blockGroup.add(cloudsGroup)
    cloudsGroupRef.current = cloudsGroup

    const cloudTex = createVolumetricCloud3DTexture()
    cloudsTextureRef.current = cloudTex

    if (cloudTex) {
      const cloudMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          map: { value: cloudTex },
          cameraPos: { value: new THREE.Vector3() },
          baseColor: { value: new THREE.Color(0x8fa3b8) },
          sunColor: { value: new THREE.Color(0xfff8ee) },
          sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.5).normalize() },
          threshold: { value: 0.35 },
          opacity: { value: 0.45 },
          range: { value: 0.12 },
          steps: { value: 48.0 },
          windOffset: { value: new THREE.Vector3(0, 0, 0) },
          frame: { value: 0 },
        },
        vertexShader: VOLUMETRIC_CLOUD_VERTEX_SHADER,
        fragmentShader: VOLUMETRIC_CLOUD_FRAGMENT_SHADER,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      })
      cloudsMatRef.current = cloudMat

      // Malla de volumen 3D: Una losa tridimensional envolvente sobre el relieve
      const cloudGeom = new THREE.BoxGeometry(1, 1, 1)
      const cloudMesh = new THREE.Mesh(cloudGeom, cloudMat)
      cloudMesh.scale.set(W * 1.35, Math.max(0.7, (W + D) * 0.08), D * 1.35)
      cloudsGroup.add(cloudMesh)
    }

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      if (autoRotateRef.current && blockGroupRef.current) {
        blockGroupRef.current.rotation.y += 0.0035
      }
      if (cloudsEnabledRef.current && cloudsMatRef.current && cameraRef.current) {
        cloudsMatRef.current.uniforms.cameraPos.value.copy(cameraRef.current.position)
        // Desplazamiento procedural de viento dentro del volumen 3D
        cloudsMatRef.current.uniforms.windOffset.value.x += 0.0003
        cloudsMatRef.current.uniforms.windOffset.value.z += 0.00015
        cloudsMatRef.current.uniforms.frame.value++
      }
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return
      const w = containerRef.current.clientWidth || 600
      const h = containerRef.current.clientHeight || 600
      if (w === 0 || h === 0) return
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h, true)
    }

    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          handleResize()
        })
      : null
    if (ro) ro.observe(container)
    window.addEventListener("resize", handleResize)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener("resize", handleResize)
      if (ro) ro.disconnect()
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      floorMeshRef.current = null
      cloudsGroupRef.current = null
      cloudsMatRef.current = null
      cloudsTextureRef.current = null
      topMeshRef.current = null
      wallsMeshRef.current = null
      sunLightRef.current = null
      hemiLightRef.current = null
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bboxKey])

  // Cambio de tema sin re-crear la escena ni aplanar el terreno
  useEffect(() => {
    if (!sceneRef.current) return
    const isLight = studioTheme === "light"
    sceneRef.current.background = new THREE.Color(isLight ? 0xdfe6dc : 0x09090b)
    if (floorMeshRef.current) {
      floorMeshRef.current.material.opacity = isLight ? 0.22 : 0.45
    }
  }, [studioTheme])

  // Ajuste reactivo inmediato al maximizar o restaurar tamaño
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return
      const w = containerRef.current.clientWidth || 600
      const h = containerRef.current.clientHeight || 600
      if (w === 0 || h === 0) return
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h, true)
    }, 40)
    return () => clearTimeout(timer)
  }, [isMaximized])

  const layerStateKey = useMemo(() => {
    if (!layerState) return ""
    return Object.entries(layerState)
      .map(([k, v]) => `${k}:${v?.on ? 1 : 0}:${v?.opacity}:${v?.color}`)
      .join("|")
  }, [layerState])

  // 2. Carga Asíncrona de Textura Satelital / Basemap + Capas Activas
  useEffect(() => {
    if (!isOpen || !rectangle?.bbox) return
    let canceled = false

    const activeVectors = getActiveVectorLayers(map, layerState, loadedFeatures)

    if (basemap === "relief") {
      const grid = elevationGridRef.current
      if (grid && grid.length > 0 && topMeshRef.current?.material) {
        const reliefTex = createReliefBasemapTexture(grid, segX, segZ, rectangle.bbox, activeVectors)
        if (reliefTex && !canceled) {
          topMeshRef.current.material.map = reliefTex
          topMeshRef.current.material.needsUpdate = true
        }
      }
      return
    }

    loadHighResSatelliteCanvas(rectangle.bbox, basemap, activeVectors).then((canvas) => {
      if (canceled || !canvas || !topMeshRef.current?.material) return

      const tex = new THREE.CanvasTexture(canvas)
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
        topMeshRef.current.material.roughness = 0.8
        topMeshRef.current.material.metalness = 0.05
        topMeshRef.current.material.color.setHex(0xffffff)
        topMeshRef.current.material.needsUpdate = true
      }
    })

    return () => {
      canceled = true
    }
  }, [isOpen, bboxKey, basemap, layerState, layerStateKey, map, loadedFeatures, segX, segZ, rectangle])

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
            const activeVectors = getActiveVectorLayers(map, layerState, loadedFeatures)
            const reliefTex = createReliefBasemapTexture(realGrid, segX, segZ, rectangle.bbox, activeVectors)
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
  }, [isOpen, bboxKey, computeHeight, basemap, segX, segZ, baseDepth, map, layerState, loadedFeatures, rectangle])

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

  // Actualización reactiva de visibilidad, altura y densidad de nubes volumétricas 3D
  useEffect(() => {
    if (!cloudsGroupRef.current) return
    cloudsGroupRef.current.visible = cloudsEnabled

    if (cloudsMatRef.current) {
      // Mapeo adaptativo de densidad: controla el umbral de corte y la absorción volumétrica Beer-Lambert
      const density = Math.max(0.1, Math.min(1.0, cloudDensity))
      cloudsMatRef.current.uniforms.threshold.value = 0.55 - density * 0.35
      cloudsMatRef.current.uniforms.opacity.value = 0.2 + density * 0.5
    }

    const minElev = elevationMinRef.current
    const maxElev = elevationMaxRef.current
    const summitY = computeHeight(maxElev, minElev, exaggeration)
    const baseRelief = Math.max(0.6, summitY)

    // Posicionamiento de altura del volumen 3D en función del relieve y el slider
    cloudsGroupRef.current.position.y = baseRelief * cloudHeightRatio
  }, [cloudsEnabled, cloudDensity, cloudHeightRatio, exaggeration, computeHeight])

  // Ángulo de Iluminación Solar continuo con sombras dinámicas realistas
  useEffect(() => {
    if (!sunLightRef.current || !hemiLightRef.current) return
    const rad = (sunAngle * Math.PI) / 180
    const dist = 18

    const sinAngle = Math.sin(rad)
    const cosAngle = Math.cos(rad)
    const sunHeight = Math.max(5.0, 14 + sinAngle * 4.5)

    sunLightRef.current.position.set(cosAngle * dist, sunHeight, sinAngle * dist)

    if (sinAngle < -0.3) {
      // Tarde / atardecer
      sunLightRef.current.color.setHex(0xffa756)
      sunLightRef.current.intensity = 1.5
      hemiLightRef.current.color.setHex(0xfed7aa)
      hemiLightRef.current.groundColor.setHex(0x27272a)
      hemiLightRef.current.intensity = 0.55
    } else if (sinAngle > 0.3) {
      // Mañana dorada
      sunLightRef.current.color.setHex(0xffecd2)
      sunLightRef.current.intensity = 1.45
      hemiLightRef.current.color.setHex(0xdbeafe)
      hemiLightRef.current.groundColor.setHex(0x3f3f46)
      hemiLightRef.current.intensity = 0.65
    } else {
      // Luz solar cenital brillante
      sunLightRef.current.color.setHex(0xffffff)
      sunLightRef.current.intensity = 1.55
      hemiLightRef.current.color.setHex(0xf0f9ff)
      hemiLightRef.current.groundColor.setHex(0x52525b)
      hemiLightRef.current.intensity = 0.85
    }

    // Actualización de dispersión y sombra solar en las nubes volumétricas 3D
    if (cloudsMatRef.current) {
      cloudsMatRef.current.uniforms.sunDirection.value
        .set(cosAngle, sunHeight / dist, sinAngle)
        .normalize()

      if (sinAngle < -0.3) {
        cloudsMatRef.current.uniforms.sunColor.value.setHex(0xffaa66)
        cloudsMatRef.current.uniforms.baseColor.value.setHex(0x667688)
      } else if (sinAngle > 0.3) {
        cloudsMatRef.current.uniforms.sunColor.value.setHex(0xffedd5)
        cloudsMatRef.current.uniforms.baseColor.value.setHex(0x7c91a6)
      } else {
        cloudsMatRef.current.uniforms.sunColor.value.setHex(0xfffef7)
        cloudsMatRef.current.uniforms.baseColor.value.setHex(0x94a8bc)
      }
    }
  }, [sunAngle])

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

      {/* Panel flotante de Configuración de Nubes */}
      {cloudsEnabled && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 bg-zinc-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-sky-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2">
            <Cloud size={14} className="text-sky-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">
                Densidad Nubes
              </span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                aria-label="Densidad de nubes"
                value={cloudDensity}
                onChange={(e) => setCloudDensity(parseFloat(e.target.value))}
                className="w-24 accent-sky-400 cursor-pointer h-1.5 bg-zinc-700 rounded-lg appearance-none"
              />
            </div>
            <span className="text-xs font-mono font-bold text-sky-400 w-10 text-right">
              {Math.round(cloudDensity * 100)}%
            </span>
          </div>

          <div className="h-6 w-[1px] bg-zinc-800" />

          <div className="flex items-center gap-2">
            <Wind size={14} className="text-sky-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">
                Altura Nubes
              </span>
              <input
                type="range"
                min="0.3"
                max="2.5"
                step="0.1"
                aria-label="Altura de nubes"
                value={cloudHeightRatio}
                onChange={(e) => setCloudHeightRatio(parseFloat(e.target.value))}
                className="w-24 accent-sky-400 cursor-pointer h-1.5 bg-zinc-700 rounded-lg appearance-none"
              />
            </div>
            <span className="text-xs font-mono font-bold text-sky-400 w-10 text-right">
              {cloudHeightRatio.toFixed(1)}×
            </span>
          </div>
        </div>
      )}

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

        {/* Control de Nubes Realistas */}
        <div className="flex items-center gap-1 pr-3 border-r border-zinc-800">
          <button
            onClick={() => setCloudsEnabled(!cloudsEnabled)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
              cloudsEnabled
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 bg-zinc-800/40 border-transparent hover:bg-zinc-800/80"
            }`}
            title={cloudsEnabled ? "Desactivar capa de nubes" : "Activar capa de nubes realistas"}
          >
            <Cloud size={14} className={cloudsEnabled ? "text-sky-300" : "text-zinc-400"} />
            <span>Nubes</span>
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
