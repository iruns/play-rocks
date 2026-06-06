import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { FACE_FOR_MATERIAL, DICE_COLLECTION, DIE_SIZE } from './useDice'
import type { DieConfig, DieType } from './useDice'
import {
  getDieTextures,
  getDieRoughnessMaps,
  getDieNormalMaps,
  getDieMetalnessMaps,
  getDieTransmissionMaps,
  getD20Textures,
} from './useDiceTextures'

function normalScale(cfg: DieConfig): THREE.Vector2 {
  const s = cfg.pipEngraving ? -0.8 : 0.85
  return new THREE.Vector2(s, s)
}

export function buildMaterials(dieIdx: number): THREE.Material[] {
  const cfg = DICE_COLLECTION[dieIdx]
  const textures = getDieTextures(dieIdx)
  const roughnessMaps = getDieRoughnessMaps(dieIdx)
  const normalMaps = getDieNormalMaps(dieIdx)
  const metalnessMaps = getDieMetalnessMaps(dieIdx)
  const transmissionMaps = getDieTransmissionMaps(dieIdx)
  const envI = cfg.envMapIntensity ?? 1.2

  return FACE_FOR_MATERIAL.map(faceNum => {
    const map = textures[faceNum - 1]
    const roughnessMap = roughnessMaps[faceNum - 1]
    const normalMap = normalMaps?.[faceNum - 1]
    const metalnessMap = metalnessMaps?.[faceNum - 1]
    const transmissionMap = transmissionMaps?.[faceNum - 1]

    if (cfg.physical) {
      const p = cfg.physical
      const hasTransmission = (p.transmission ?? 0) > 0
      const params: THREE.MeshPhysicalMaterialParameters = {
        map, envMapIntensity: envI,
        metalness: p.metalness ?? 0.0,
        // transmission dies: skip roughnessMap (UV-baked contrast looks painted on),
        // use scalar roughness directly so the value affects blur uniformly
        roughnessMap: hasTransmission ? undefined : roughnessMap,
        roughness:    hasTransmission ? (p.roughness ?? 0.1) : 1.0,
      }
      if (metalnessMap) { params.metalnessMap = metalnessMap; params.metalness = 1.0 }
      if (p.color !== undefined)         params.color          = new THREE.Color(p.color)
      if (hasTransmission)               { params.transmission = p.transmission!; params.thickness = p.thickness ?? 0.85; params.transparent = true; params.side = THREE.DoubleSide; if (transmissionMap) params.transmissionMap = transmissionMap }
      if (p.opacity !== undefined && p.opacity < 1) { params.opacity = p.opacity; params.transparent = true; params.depthWrite = false }
      if (p.ior !== undefined)            params.ior            = p.ior
      if (p.iridescence !== undefined)   { params.iridescence  = p.iridescence; params.iridescenceIOR = p.iridescenceIOR ?? 1.5 }
      if (p.clearcoat !== undefined)     { params.clearcoat    = p.clearcoat;   params.clearcoatRoughness = p.clearcoatRoughness ?? 0.05 }
      if (normalMap) { params.normalMap = normalMap; params.normalScale = normalScale(cfg) }
      return new THREE.MeshPhysicalMaterial(params)
    }

    const s = cfg.standard ?? {}
    const sp: THREE.MeshStandardMaterialParameters = {
      map, roughnessMap, envMapIntensity: envI,
      roughness: 1.0,
      metalness: s.metalness ?? 0.04,
    }
    if (metalnessMap) { sp.metalnessMap = metalnessMap; sp.metalness = 1.0 }
    if (s.color !== undefined) sp.color = new THREE.Color(s.color)
    if (normalMap) { sp.normalMap = normalMap; sp.normalScale = normalScale(cfg) }
    return new THREE.MeshStandardMaterial(sp)
  })
}

function buildD20Material(dieIdx: number): THREE.Material {
  const cfg = DICE_COLLECTION[dieIdx]
  const envI = cfg.envMapIntensity ?? 1.2
  const d20tex = getD20Textures(dieIdx)
  const ns = new THREE.Vector2(0.85, 0.85)

  if (cfg.physical) {
    const p = cfg.physical
    const hasTransmission = (p.transmission ?? 0) > 0
    const params: THREE.MeshPhysicalMaterialParameters = {
      envMapIntensity: envI,
      metalness: p.metalness ?? 0.0,
      roughness: p.roughness ?? 0.2,
      color: p.color !== undefined ? new THREE.Color(p.color) : new THREE.Color(cfg.faceColor),
    }
    if (d20tex.map)          { params.map = d20tex.map }
    if (d20tex.normalMap)    { params.normalMap = d20tex.normalMap; params.normalScale = ns }
    if (d20tex.roughnessMap) { params.roughnessMap = d20tex.roughnessMap; params.roughness = 1.0 }
    if (hasTransmission) {
      params.transmission = p.transmission!
      params.thickness = p.thickness ?? 0.85
      params.transparent = true
      params.side = THREE.DoubleSide
    }
    if (p.opacity !== undefined && p.opacity < 1) { params.opacity = p.opacity; params.transparent = true; params.depthWrite = false }
    if (p.ior !== undefined)           params.ior            = p.ior
    if (p.iridescence !== undefined) { params.iridescence    = p.iridescence; params.iridescenceIOR = p.iridescenceIOR ?? 1.5 }
    if (p.clearcoat !== undefined)   { params.clearcoat      = p.clearcoat;   params.clearcoatRoughness = p.clearcoatRoughness ?? 0.05 }
    return new THREE.MeshPhysicalMaterial(params)
  }

  const s = cfg.standard ?? {}
  const sp: THREE.MeshStandardMaterialParameters = {
    envMapIntensity: envI,
    roughness: d20tex.roughnessMap ? 1.0 : (s.roughness ?? 0.5),
    metalness: s.metalness ?? 0.04,
    color: s.color !== undefined ? new THREE.Color(s.color) : new THREE.Color(cfg.faceColor),
  }
  if (d20tex.map)          sp.map = d20tex.map
  if (d20tex.normalMap)    { sp.normalMap = d20tex.normalMap; sp.normalScale = ns }
  if (d20tex.roughnessMap) sp.roughnessMap = d20tex.roughnessMap
  return new THREE.MeshStandardMaterial(sp)
}

export function makeDieMesh(dieIdx: number, dieType: DieType = 'd6'): THREE.Mesh {
  if (dieType === 'd20') {
    const geo = new THREE.IcosahedronGeometry(0.55, 0)
    const mat = buildD20Material(dieIdx)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    return mesh
  }
  const geo = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.07)
  const mats = buildMaterials(dieIdx)
  const mesh = new THREE.Mesh(geo, mats)
  mesh.castShadow = true
  return mesh
}

export function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose()
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  mats.forEach((m: THREE.Material) => m.dispose())
}
