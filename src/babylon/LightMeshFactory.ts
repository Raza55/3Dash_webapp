import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  PointLight,
  ShadowGenerator,
  Quaternion,
  Mesh,
  type AbstractMesh,
  type Node,
} from '@babylonjs/core';
import type { LightConfig, LightPart, LightPosition, LightSize } from '../types';

export interface LightMeshEntry {
  bulb: Mesh;
  /** Additional part meshes (multi-part lights). All share the same material. */
  extraBulbs: Mesh[];
  mat: StandardMaterial;
  /** Primary point light (sphere) or first sub-light (strip). */
  light?: PointLight;
  /** Additional sub-lights spread along a strip. Empty for non-strip lights. */
  stripLights: PointLight[];
  shadowGen?: ShadowGenerator;
  /** Custom hitbox mesh for click detection. Invisible by default, shown when editing. */
  hitboxMesh?: Mesh;
  hitboxMat?: StandardMaterial;
}

export type MeshMap = Record<string, LightMeshEntry>;

export interface StripConfig {
  spacing: number;
  maxLights: number;
  range: number;
}

export const DEFAULT_STRIP_CONFIG: StripConfig = {
  spacing: 1,
  maxLights: 4,
  range: 6,
};

export interface CreateLightMeshOptions {
  withPointLight?: boolean;
  shadowCasters?: AbstractMesh[];
  stripConfig?: StripConfig;
  singleRange?: number;
  shadowResolution?: number;
  parent?: Node;
  sceneScale?: number;
}

/** Minimum ratio between longest and shortest cube dimension to be treated as a strip. */
const STRIP_RATIO = 3;
const NANOLEAF_PANEL_COORDS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [2, -1],
  [-2, 1],
  [1, 1],
];

/**
 * Create a light mesh (sphere, ellipsoid, or cube) with optional PointLight(s) and shadow generator.
 * Long thin cubes are detected as LED strips and get multiple sub-lights.
 */
export function createLightMesh(
  scene: Scene,
  cfg: LightConfig,
  id: string,
  options: CreateLightMeshOptions = {},
): LightMeshEntry {
  const { withPointLight = false, shadowCasters, stripConfig, singleRange, shadowResolution, parent, sceneScale = 1 } = options;
  const sc = stripConfig ?? DEFAULT_STRIP_CONFIG;
  const canCreateShadow = !!shadowCasters?.length && shadowResolution !== 0;
  const pos = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);

  const mat = new StandardMaterial(`bulbmat_${id}`, scene);
  mat.disableLighting = true;

  if (withPointLight) {
    mat.emissiveColor = new Color3(0, 0, 0);
  } else {
    mat.emissiveColor = new Color3(0.9, 0.75, 0.2);
    mat.alpha = 0.85;
  }

  const hasParts = cfg.parts && cfg.parts.length > 0;
  const extraBulbs: Mesh[] = [];

  let bulb: Mesh;
  if (hasParts) {
    // Multi-part: create one mesh per part, all sharing the same material
    const parts = cfg.parts!;
    bulb = createPartMesh(scene, parts[0], `bulb_${id}_0`, mat, cfg.entityId);
    for (let i = 1; i < parts.length; i++) {
      extraBulbs.push(createPartMesh(scene, parts[i], `bulb_${id}_${i}`, mat, cfg.entityId));
    }
    // All parts non-pickable when multi-part (hitbox handles clicks)
    bulb.isPickable = false;
    for (const eb of extraBulbs) eb.isPickable = false;
  } else {
    const shape = cfg.shape || 'sphere';
    const sz = cfg.size || {};
    bulb = createShapeMesh(scene, `bulb_${id}`, shape, sz);
    bulb.position = pos.clone();
    applyTransform(bulb, cfg.rotation, cfg.scale);
    bulb.metadata = { entityId: cfg.entityId };
    bulb.material = mat;
    bulb.applyFog = false;
  }

  let pointLight: PointLight | undefined;
  let shadowGen: ShadowGenerator | undefined;
  const stripLights: PointLight[] = [];

  if (withPointLight) {
    const singleShape = cfg.shape || 'sphere';
    const singleSz = cfg.size || {};
    const effectiveSingleSz = applySizeScale(singleSz, cfg.scale);
    // Detect strip shape: cube with one dimension >= STRIP_RATIO × the smallest
    const isStrip = !hasParts && singleShape === 'cube' && detectStrip(effectiveSingleSz);

    if (isStrip) {
      // Create multiple sub-lights along the strip
      const stripInfo = getStripAxis(effectiveSingleSz);
      const count = Math.max(2, Math.min(sc.maxLights, Math.ceil(stripInfo.length / sc.spacing)));
      const halfLen = stripInfo.length / 2;
      const axisVector = getAxisVector(stripInfo.axis);

      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1 to +1
        const offset = t * halfLen;
        const lightPos = pos.add(rotateVector(axisVector.scale(offset), cfg.rotation));

        const pl = new PointLight(`pl_${id}_${i}`, lightPos, scene);
        pl.intensity = 0;
        pl.setEnabled(false);
        pl.range = sc.range * sceneScale;
        pl.diffuse = new Color3(1, 0.9, 0.7);
        stripLights.push(pl);
      }

      // Use first sub-light as the "primary" light
      pointLight = stripLights[0];

      // Shadow generator on the center sub-light only (best coverage, cheaper)
      const centerIdx = Math.floor(count / 2);
      const shadowLight = stripLights[centerIdx];
      if (canCreateShadow) {
        shadowGen = createPointShadowGen(shadowLight, shadowCasters!, shadowResolution);
      }
    } else {
      // Single point light at entity position
      pointLight = new PointLight(`pl_${id}`, pos, scene);
      pointLight.intensity = 0;
      pointLight.setEnabled(false);
      pointLight.range = (singleRange ?? 7) * sceneScale;
      pointLight.diffuse = new Color3(1, 0.9, 0.7);

      if (canCreateShadow) {
        shadowGen = createPointShadowGen(pointLight, shadowCasters!, shadowResolution);
      }
    }
  }

  // Create custom hitbox mesh if configured (or auto-create for multi-part)
  let hitboxMesh: Mesh | undefined;
  let hitboxMat: StandardMaterial | undefined;
  const needsHitbox = cfg.hitbox || hasParts;
  if (needsHitbox) {
    if (cfg.hitbox) {
      const hbShape = cfg.hitbox.shape;
      const hbSz = cfg.hitbox.size || {};
      hitboxMesh = createShapeMesh(scene, `hitbox_${id}`, hbShape, hbSz, { sphere: 0.5, box: 0.5 });
      const hbPos = cfg.hitbox.position
        ? new Vector3(cfg.hitbox.position.x, cfg.hitbox.position.y, cfg.hitbox.position.z)
        : pos.clone();
      hitboxMesh.position = hbPos;
      applyTransform(hitboxMesh, cfg.hitbox.rotation, cfg.hitbox.scale);
    } else {
      // Auto-create bounding-box hitbox for multi-part lights
      const bounds = computePartsBounds(cfg.parts!);
      hitboxMesh = MeshBuilder.CreateBox(`hitbox_${id}`, {
        width: bounds.size.x,
        height: bounds.size.y,
        depth: bounds.size.z,
      }, scene);
      hitboxMesh.position = bounds.center;
    }
    hitboxMesh.metadata = { entityId: cfg.entityId };
    hitboxMesh.isPickable = true;

    hitboxMat = new StandardMaterial(`hitboxmat_${id}`, scene);
    hitboxMat.disableLighting = true;
    hitboxMat.emissiveColor = new Color3(1, 0.2, 0.8); // magenta
    hitboxMat.alpha = 0.3;
    hitboxMat.wireframe = true;
    hitboxMesh.material = hitboxMat;
    hitboxMesh.visibility = 0; // invisible by default

    // When hitbox exists, bulb should not catch clicks
    bulb.isPickable = false;
  }

  const entry = { bulb, extraBulbs, mat, light: pointLight, stripLights, shadowGen, hitboxMesh, hitboxMat };
  if (parent) parentLightEntry(entry, parent);
  return entry;
}

function parentLightEntry(entry: LightMeshEntry, parent: Node): void {
  entry.bulb.parent = parent;
  for (const mesh of entry.extraBulbs) mesh.parent = parent;
  if (entry.hitboxMesh) entry.hitboxMesh.parent = parent;
  if (entry.light) entry.light.parent = parent;
  for (const light of entry.stripLights) light.parent = parent;
}

/** Create a shadow generator for a PointLight. */
function createPointShadowGen(
  light: PointLight,
  shadowCasters: AbstractMesh[],
  resolution = 512,
): ShadowGenerator {
  const sg = new ShadowGenerator(resolution, light);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0;
  sg.normalBias = 0.05;

  for (const mesh of shadowCasters) {
    sg.addShadowCaster(mesh, false);
  }
  return sg;
}

/** Create a primitive mesh for a configured light shape. */
function createShapeMesh(
  scene: Scene,
  name: string,
  shape: LightPart['shape'],
  size: LightSize,
  fallback: { sphere: number; box: number } = { sphere: 0.25, box: 0.3 },
): Mesh {
  if (shape === 'nanoleafShapes') {
    return createNanoleafShapesMesh(scene, name, size, fallback);
  }

  if (shape === 'cube') {
    return MeshBuilder.CreateBox(name, {
      width: size.width ?? fallback.box,
      height: size.height ?? fallback.box,
      depth: size.depth ?? fallback.box,
    }, scene);
  }

  if (shape === 'ellipsoid') {
    const mesh = MeshBuilder.CreateSphere(name, { diameter: 1 }, scene);
    mesh.scaling = new Vector3(
      size.width ?? size.diameter ?? fallback.box,
      size.height ?? size.diameter ?? fallback.box,
      size.depth ?? size.diameter ?? fallback.box,
    );
    return mesh;
  }

  return MeshBuilder.CreateSphere(name, {
    diameter: size.diameter ?? fallback.sphere,
  }, scene);
}

function createNanoleafShapesMesh(
  scene: Scene,
  name: string,
  size: LightSize,
  fallback: { sphere: number; box: number },
): Mesh {
  const targetWidth = size.width ?? Math.max(1.15, fallback.box * 4);
  const targetHeight = size.height ?? Math.max(0.78, fallback.box * 2.6);
  const targetDepth = size.depth ?? 0.035;
  const rawRadius = 0.5;
  const rawDx = rawRadius * 1.58;
  const rawDy = rawRadius * 1.36;

  const rawPositions = NANOLEAF_PANEL_COORDS.map(([q, r]) => ({
    x: q * rawDx,
    y: (r + q * 0.5) * rawDy,
  }));
  const minX = Math.min(...rawPositions.map((p) => p.x - rawRadius));
  const maxX = Math.max(...rawPositions.map((p) => p.x + rawRadius));
  const minY = Math.min(...rawPositions.map((p) => p.y - rawRadius));
  const maxY = Math.max(...rawPositions.map((p) => p.y + rawRadius));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const panelScale = Math.min(
    targetWidth / Math.max(0.001, maxX - minX),
    targetHeight / Math.max(0.001, maxY - minY),
  );

  const panels = rawPositions.map((p, index) => {
    const panel = MeshBuilder.CreateCylinder(`${name}_panel_${index}`, {
      height: targetDepth,
      diameter: rawRadius * panelScale * 1.88,
      tessellation: 6,
    }, scene);
    panel.rotation.x = Math.PI / 2;
    panel.position.set((p.x - centerX) * panelScale, (p.y - centerY) * panelScale, 0);
    panel.bakeCurrentTransformIntoVertices();
    return panel;
  });

  const merged = Mesh.MergeMeshes(panels, true, true, undefined, false, true);
  if (merged) {
    merged.name = name;
    return merged;
  }

  return MeshBuilder.CreateBox(name, {
    width: targetWidth,
    height: targetHeight,
    depth: targetDepth,
  }, scene);
}

/** Create a single part mesh with shared material. */
function createPartMesh(
  scene: Scene,
  part: LightPart,
  name: string,
  mat: StandardMaterial,
  entityId: string,
): Mesh {
  const sz = part.size || {};
  const mesh = createShapeMesh(scene, name, part.shape, sz);
  mesh.position = new Vector3(part.position.x, part.position.y, part.position.z);
  applyTransform(mesh, part.rotation, part.scale);
  mesh.metadata = { entityId };
  mesh.material = mat;
  mesh.applyFog = false;
  return mesh;
}

/** Compute an axis-aligned bounding box around all parts. */
function computePartsBounds(parts: LightPart[]): { center: Vector3; size: Vector3 } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const dimensions = getShapeDimensions(p.shape, p.size || {}).multiply(vectorFromScale(p.scale));
    const hw = dimensions.x / 2;
    const hh = dimensions.y / 2;
    const hd = dimensions.z / 2;
    minX = Math.min(minX, p.position.x - hw);
    maxX = Math.max(maxX, p.position.x + hw);
    minY = Math.min(minY, p.position.y - hh);
    maxY = Math.max(maxY, p.position.y + hh);
    minZ = Math.min(minZ, p.position.z - hd);
    maxZ = Math.max(maxZ, p.position.z + hd);
  }
  return {
    center: new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    size: new Vector3(maxX - minX, maxY - minY, maxZ - minZ),
  };
}

function applyTransform(mesh: Mesh, rotation?: LightPosition, scale?: LightPosition): void {
  if (rotation) {
    mesh.rotation.set(toRadians(rotation.x), toRadians(rotation.y), toRadians(rotation.z));
  }
  if (scale) {
    const safeScale = vectorFromScale(scale);
    mesh.scaling.multiplyInPlace(safeScale);
  }
}

function applySizeScale(size: LightSize, scale?: LightPosition): LightSize {
  if (!scale) return size;
  const safeScale = vectorFromScale(scale);
  return {
    diameter: size.diameter !== undefined ? size.diameter * Math.max(safeScale.x, safeScale.y, safeScale.z) : undefined,
    width: (size.width ?? size.diameter) !== undefined ? (size.width ?? size.diameter)! * safeScale.x : undefined,
    height: (size.height ?? size.diameter) !== undefined ? (size.height ?? size.diameter)! * safeScale.y : undefined,
    depth: (size.depth ?? size.diameter) !== undefined ? (size.depth ?? size.diameter)! * safeScale.z : undefined,
  };
}

function vectorFromScale(scale?: LightPosition): Vector3 {
  return new Vector3(
    Math.max(0.001, scale?.x ?? 1),
    Math.max(0.001, scale?.y ?? 1),
    Math.max(0.001, scale?.z ?? 1),
  );
}

function rotateVector(vector: Vector3, rotation?: LightPosition): Vector3 {
  if (!rotation) return vector;
  const q = Quaternion.FromEulerAngles(
    toRadians(rotation.x),
    toRadians(rotation.y),
    toRadians(rotation.z),
  );
  const result = new Vector3();
  vector.rotateByQuaternionToRef(q, result);
  return result;
}

function getAxisVector(axis: 'x' | 'y' | 'z'): Vector3 {
  if (axis === 'x') return new Vector3(1, 0, 0);
  if (axis === 'y') return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getShapeDimensions(shape: LightPart['shape'], size: LightSize): Vector3 {
  if (shape === 'sphere') {
    const diameter = size.diameter ?? 0.25;
    return new Vector3(diameter, diameter, diameter);
  }

  return new Vector3(
    size.width ?? size.diameter ?? 0.3,
    size.height ?? size.diameter ?? 0.3,
    size.depth ?? size.diameter ?? 0.3,
  );
}

/** Check if cube dimensions qualify as a strip (one axis ≥ STRIP_RATIO × smallest). */
function detectStrip(sz: LightSize): boolean {
  const w = sz.width ?? 0.3;
  const h = sz.height ?? 0.3;
  const d = sz.depth ?? 0.3;
  const maxDim = Math.max(w, h, d);
  const minDim = Math.min(w, h, d);
  return maxDim >= minDim * STRIP_RATIO;
}

/** Determine the longest axis and length for a strip. */
function getStripAxis(sz: LightSize): { axis: 'x' | 'y' | 'z'; length: number } {
  const w = sz.width ?? 0.3;
  const h = sz.height ?? 0.3;
  const d = sz.depth ?? 0.3;
  if (w >= h && w >= d) return { axis: 'x', length: w };
  if (h >= w && h >= d) return { axis: 'y', length: h };
  return { axis: 'z', length: d };
}

export function removeLightMesh(meshMap: MeshMap, entityId: string): void {
  const entry = meshMap[entityId];
  if (!entry) return;
  entry.shadowGen?.dispose();
  // Dispose strip sub-lights (skip index 0 if it's also entry.light — disposed below)
  for (let i = 0; i < entry.stripLights.length; i++) {
    const sl = entry.stripLights[i];
    if (sl !== entry.light) sl.dispose();
  }
  for (const eb of entry.extraBulbs) eb.dispose();
  entry.hitboxMesh?.dispose();
  entry.bulb.dispose();
  entry.light?.dispose();
  delete meshMap[entityId];
}

export function rebuildAllMeshes(
  scene: Scene,
  meshMap: MeshMap,
  lights: LightConfig[],
  options: CreateLightMeshOptions = {},
): void {
  Object.keys(meshMap).forEach((id) => removeLightMesh(meshMap, id));

  lights.forEach((cfg, i) => {
    const entry = createLightMesh(
      scene,
      cfg,
      options.withPointLight ? cfg.entityId : String(i),
      options,
    );
    meshMap[cfg.entityId] = entry;
  });
}

/**
 * Freeze all PointLight shadow maps after the first render.
 * Call once all lights are created and at least one frame has rendered.
 */
export function freezePointLightShadows(meshMap: MeshMap): void {
  for (const key of Object.keys(meshMap)) {
    const entry = meshMap[key];
    if (entry.shadowGen) {
      const sm = entry.shadowGen.getShadowMap();
      if (sm) sm.refreshRate = 0;
    }
  }
}
