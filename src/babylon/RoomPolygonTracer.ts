import { Ray, Vector3, type AbstractMesh, type PickingInfo, type Scene } from '@babylonjs/core';
import type { RoomZonePoint } from '../types';

export interface RoomPolygonTraceResult {
  points: RoomZonePoint[];
  width: number;
  depth: number;
  floorY: number;
  confidence: number;
  usedFallback: boolean;
}

interface TraceOptions {
  modelDiagonal: number;
  modelScale: number;
  fallbackWidth: number;
  fallbackDepth: number;
  rayCount?: number;
}

interface Point2 {
  x: number;
  z: number;
}

interface ModelBounds {
  min: Vector3;
  max: Vector3;
}

interface FloorCandidate {
  y: number;
  surfaceBonus: number;
}

interface WallHit {
  distance: number;
  heightIndex: number;
  wallLike: boolean;
}

interface DistanceCluster {
  distanceSum: number;
  count: number;
  heightIndexes: Set<number>;
  wallHeightIndexes: Set<number>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-10) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.z - (start.z + t * dz));
}

function simplifyOpen(points: Point2[], tolerance: number): Point2[] {
  if (points.length <= 2) return points;
  let furthestIndex = -1;
  let furthestDistance = tolerance;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }
  if (furthestIndex === -1) return [points[0], points[points.length - 1]];
  const before = simplifyOpen(points.slice(0, furthestIndex + 1), tolerance);
  const after = simplifyOpen(points.slice(furthestIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

function circularPath(points: Point2[], start: number, end: number): Point2[] {
  const path: Point2[] = [];
  let index = start;
  while (true) {
    path.push(points[index]);
    if (index === end) return path;
    index = (index + 1) % points.length;
  }
}

function simplifyClosed(points: Point2[], tolerance: number): Point2[] {
  if (points.length <= 4) return points;
  let first = 0;
  let second = Math.floor(points.length / 2);
  let largestDistance = -1;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const distance = (points[a].x - points[b].x) ** 2 + (points[a].z - points[b].z) ** 2;
      if (distance > largestDistance) {
        largestDistance = distance;
        first = a;
        second = b;
      }
    }
  }
  const pathA = simplifyOpen(circularPath(points, first, second), tolerance);
  const pathB = simplifyOpen(circularPath(points, second, first), tolerance);
  return [...pathA.slice(0, -1), ...pathB.slice(0, -1)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fillMissingDistances(distances: Array<number | null>): number[] | null {
  const validCount = distances.filter((value): value is number => value !== null).length;
  if (validCount < distances.length * 0.32) return null;
  const result = [...distances];
  for (let index = 0; index < result.length; index++) {
    if (result[index] !== null) continue;
    let previous = index;
    let next = index;
    for (let step = 1; step < result.length; step++) {
      const candidate = (index - step + result.length) % result.length;
      if (result[candidate] !== null) { previous = candidate; break; }
    }
    for (let step = 1; step < result.length; step++) {
      const candidate = (index + step) % result.length;
      if (result[candidate] !== null) { next = candidate; break; }
    }
    const previousDistance = result[previous] as number;
    const nextDistance = result[next] as number;
    const span = (next - previous + result.length) % result.length || result.length;
    const offset = (index - previous + result.length) % result.length;
    result[index] = previousDistance + (nextDistance - previousDistance) * (offset / span);
  }
  return result as number[];
}

function smoothDistances(distances: number[]): number[] {
  return distances.map((_, index) => median([
    distances[(index - 2 + distances.length) % distances.length],
    distances[(index - 1 + distances.length) % distances.length],
    distances[index],
    distances[(index + 1) % distances.length],
    distances[(index + 2) % distances.length],
  ]));
}

function roundPoint(point: Point2): RoomZonePoint {
  return {
    x: parseFloat(point.x.toFixed(3)),
    z: parseFloat(point.z.toFixed(3)),
  };
}

function dimensions(points: RoomZonePoint[]): { width: number; depth: number } {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    width: Math.max(0.1, Math.max(...xs) - Math.min(...xs)),
    depth: Math.max(0.1, Math.max(...zs) - Math.min(...zs)),
  };
}

function fallbackResult(width: number, depth: number, floorY: number): RoomPolygonTraceResult {
  const points = [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ].map(roundPoint);
  return { points, width, depth, floorY, confidence: 0, usedFallback: true };
}

function modelBounds(meshes: AbstractMesh[]): ModelBounds {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    try {
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
    } catch {
      // Imported helper meshes may not expose stable bounds.
    }
  }
  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return { min: Vector3.Zero(), max: Vector3.Zero() };
  }
  return { min, max };
}

function pickNormalY(pick: PickingInfo): number | null {
  try {
    const normal = pick.getNormal(true, true);
    return normal ? Math.abs(normal.y) : null;
  } catch {
    return null;
  }
}

function meshName(mesh: AbstractMesh): string {
  const metadata = mesh.metadata as Record<string, unknown> | null;
  return `${mesh.name} ${String(metadata?.modelObjectLabel ?? '')}`.toLowerCase();
}

function horizontalFootprintBonus(mesh: AbstractMesh, diagonal: number): number {
  try {
    const box = mesh.getBoundingInfo().boundingBox;
    const size = box.maximumWorld.subtract(box.minimumWorld);
    const longSide = Math.max(size.x, size.z);
    const shortSide = Math.min(size.x, size.z);
    const name = meshName(mesh);
    if (/floor|ground|boden|decke|ceiling/.test(name)) return 0.3;
    if (longSide >= diagonal * 0.16 && shortSide >= diagonal * 0.07) return 0.2;
    if (longSide >= diagonal * 0.1 && shortSide >= diagonal * 0.035) return 0.1;
  } catch {
    // No footprint bonus when imported bounds cannot be read.
  }
  return 0;
}

function likelyWallMesh(mesh: AbstractMesh, floorY: number, wallHeight: number, diagonal: number): boolean {
  const name = meshName(mesh);
  if (/wall|wand|mur|cloison/.test(name)) return true;
  if (/chair|stuhl|table|tisch|bed|bett|sofa|couch|cabinet|schrank|shelf|regal/.test(name)) return false;
  try {
    const box = mesh.getBoundingInfo().boundingBox;
    const size = box.maximumWorld.subtract(box.minimumWorld);
    const horizontalLong = Math.max(size.x, size.z);
    const horizontalShort = Math.min(size.x, size.z);
    const reachesUpperWall = box.maximumWorld.y >= floorY + wallHeight * 0.68;
    const isTall = size.y >= wallHeight * 0.52;
    const isThin = horizontalShort <= Math.max(diagonal * 0.018, horizontalLong * 0.22);
    return reachesUpperWall && isTall && isThin && horizontalLong >= diagonal * 0.025;
  } catch {
    return false;
  }
}

function modelPicks(scene: Scene, ray: Ray, modelMeshSet: Set<AbstractMesh>): PickingInfo[] {
  return (scene.multiPickWithRay(
    ray,
    (mesh) => modelMeshSet.has(mesh) && mesh.isEnabled() && mesh.isVisible,
  ) ?? []).filter((pick) => pick.hit && Boolean(pick.pickedPoint));
}

function mergeFloorCandidate(candidates: FloorCandidate[], candidate: FloorCandidate, tolerance: number): void {
  const existing = candidates.find((entry) => Math.abs(entry.y - candidate.y) <= tolerance);
  if (existing) {
    existing.y = (existing.y + candidate.y) / 2;
    existing.surfaceBonus = Math.max(existing.surfaceBonus, candidate.surfaceBonus);
    return;
  }
  candidates.push(candidate);
}

function floorSurfaceSupport(
  scene: Scene,
  x: number,
  z: number,
  candidateY: number,
  modelMeshSet: Set<AbstractMesh>,
  diagonal: number,
): number {
  const offsets: Point2[] = [{ x: 0, z: 0 }];
  for (const radius of [diagonal * 0.012, diagonal * 0.028]) {
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      offsets.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
    }
  }
  const tolerance = diagonal * 0.004;
  let supported = 0;
  for (const offset of offsets) {
    const ray = new Ray(
      new Vector3(x + offset.x, candidateY + diagonal * 0.018, z + offset.z),
      Vector3.Down(),
      diagonal * 0.045,
    );
    const hasSurface = modelPicks(scene, ray, modelMeshSet).some((pick) => {
      const point = pick.pickedPoint;
      const normalY = pickNormalY(pick);
      return Boolean(point) && Math.abs(point!.y - candidateY) <= tolerance && (normalY === null || normalY >= 0.68);
    });
    if (hasSurface) supported++;
  }
  return supported / offsets.length;
}

function findFloorY(
  scene: Scene,
  clickedPoint: Vector3,
  modelMeshes: AbstractMesh[],
  modelMeshSet: Set<AbstractMesh>,
  diagonal: number,
): number {
  const bounds = modelBounds(modelMeshes);
  const verticalSpan = Math.max(diagonal * 0.03, bounds.max.y - bounds.min.y);
  const maxDrop = clamp(verticalSpan * 0.65, diagonal * 0.035, diagonal * 0.14);
  const tolerance = diagonal * 0.003;
  const candidates: FloorCandidate[] = [{ y: clickedPoint.y, surfaceBonus: 0 }];
  const ray = new Ray(
    new Vector3(clickedPoint.x, bounds.max.y + diagonal * 0.02, clickedPoint.z),
    Vector3.Down(),
    verticalSpan + diagonal * 0.08,
  );

  for (const pick of modelPicks(scene, ray, modelMeshSet)) {
    const point = pick.pickedPoint;
    const mesh = pick.pickedMesh;
    const normalY = pickNormalY(pick);
    if (!point || !mesh || (normalY !== null && normalY < 0.68)) continue;
    if (point.y > clickedPoint.y + tolerance || point.y < clickedPoint.y - maxDrop) continue;
    mergeFloorCandidate(candidates, {
      y: point.y,
      surfaceBonus: horizontalFootprintBonus(mesh, diagonal),
    }, tolerance);
  }

  let bestY = clickedPoint.y;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const support = floorSurfaceSupport(
      scene,
      clickedPoint.x,
      clickedPoint.z,
      candidate.y,
      modelMeshSet,
      diagonal,
    );
    const dropPenalty = Math.abs(clickedPoint.y - candidate.y) / Math.max(maxDrop, 1e-6) * 0.08;
    const score = support + candidate.surfaceBonus - dropPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestY = candidate.y;
    }
  }
  return bestY;
}

function clusterWallHits(hits: WallHit[], tolerance: number): DistanceCluster[] {
  const clusters: DistanceCluster[] = [];
  for (const hit of [...hits].sort((a, b) => a.distance - b.distance)) {
    const cluster = clusters.find((candidate) =>
      Math.abs(candidate.distanceSum / candidate.count - hit.distance) <= tolerance);
    if (cluster) {
      cluster.distanceSum += hit.distance;
      cluster.count++;
      cluster.heightIndexes.add(hit.heightIndex);
      if (hit.wallLike) cluster.wallHeightIndexes.add(hit.heightIndex);
    } else {
      clusters.push({
        distanceSum: hit.distance,
        count: 1,
        heightIndexes: new Set([hit.heightIndex]),
        wallHeightIndexes: new Set(hit.wallLike ? [hit.heightIndex] : []),
      });
    }
  }
  return clusters;
}

function wallDistance(
  scene: Scene,
  origin: Vector3,
  direction: Vector3,
  probeHeights: number[],
  modelMeshSet: Set<AbstractMesh>,
  wallHeight: number,
  diagonal: number,
  minimumDistance: number,
  maxDistance: number,
): number | null {
  const hits: WallHit[] = [];
  probeHeights.forEach((height, heightIndex) => {
    const ray = new Ray(new Vector3(origin.x, origin.y + height, origin.z), direction, maxDistance);
    for (const pick of modelPicks(scene, ray, modelMeshSet)) {
      if (!pick.pickedMesh || pick.distance <= minimumDistance || pick.distance > maxDistance) continue;
      const normalY = pickNormalY(pick);
      if (normalY !== null && normalY > 0.58) continue;
      hits.push({
        distance: pick.distance,
        heightIndex,
        wallLike: likelyWallMesh(pick.pickedMesh, origin.y, wallHeight, diagonal),
      });
    }
  });
  if (!hits.length) return null;

  const clusters = clusterWallHits(hits, diagonal * 0.012);
  const minimumSupport = Math.max(2, Math.ceil(probeHeights.length * 0.6));
  const wallClusters = clusters.filter((cluster) => cluster.wallHeightIndexes.size >= minimumSupport);
  if (wallClusters.length) {
    return Math.min(...wallClusters.map((cluster) => cluster.distanceSum / cluster.count));
  }

  const consistent = clusters.filter((cluster) => cluster.heightIndexes.size >= minimumSupport);
  if (!consistent.length) return null;
  const bestSupport = Math.max(...consistent.map((cluster) => cluster.heightIndexes.size));
  return Math.min(...consistent
    .filter((cluster) => cluster.heightIndexes.size >= bestSupport - 1)
    .map((cluster) => cluster.distanceSum / cluster.count));
}

/**
 * Projects the click onto a broad horizontal floor and then approximates the room
 * boundary with horizontal rays. Wall candidates must be vertically consistent at
 * several heights, which filters most furniture before the contour is simplified.
 */
export function traceRoomPolygon(
  scene: Scene,
  floorPoint: Vector3,
  modelMeshes: AbstractMesh[],
  options: TraceOptions,
): RoomPolygonTraceResult {
  const diagonal = Math.max(0.1, options.modelDiagonal);
  const scale = Math.max(0.001, options.modelScale);
  const rayCount = Math.max(32, options.rayCount ?? 72);
  const maxDistance = diagonal * 0.42;
  const minimumDistance = diagonal * 0.006;
  const inset = diagonal * 0.0025;
  const modelMeshSet = new Set(modelMeshes);
  const floorY = findFloorY(scene, floorPoint, modelMeshes, modelMeshSet, diagonal);
  const bounds = modelBounds(modelMeshes);
  const wallHeight = clamp(bounds.max.y - floorY, diagonal * 0.06, diagonal * 0.24);
  const probeHeights = [0.3, 0.44, 0.58, 0.72, 0.86].map((ratio) =>
    clamp(wallHeight * ratio, diagonal * 0.018, diagonal * 0.22));
  const rayOrigin = new Vector3(floorPoint.x, floorY, floorPoint.z);
  const rawDistances: Array<number | null> = [];

  for (let index = 0; index < rayCount; index++) {
    const angle = (index / rayCount) * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    rawDistances.push(wallDistance(
      scene,
      rayOrigin,
      direction,
      probeHeights,
      modelMeshSet,
      wallHeight,
      diagonal,
      minimumDistance,
      maxDistance,
    ));
  }

  const validCount = rawDistances.filter((value) => value !== null).length;
  const filled = fillMissingDistances(rawDistances);
  if (!filled) return fallbackResult(options.fallbackWidth, options.fallbackDepth, floorY);
  const smoothed = smoothDistances(filled);
  let worldPoints: Point2[] = smoothed.map((distance, index) => {
    const angle = (index / rayCount) * Math.PI * 2;
    const safeDistance = Math.max(minimumDistance, distance - inset);
    return {
      x: Math.cos(angle) * safeDistance,
      z: Math.sin(angle) * safeDistance,
    };
  });

  let tolerance = diagonal * 0.004;
  worldPoints = simplifyClosed(worldPoints, tolerance);
  while (worldPoints.length > 16) {
    tolerance *= 1.35;
    worldPoints = simplifyClosed(worldPoints, tolerance);
  }
  if (worldPoints.length < 3) return fallbackResult(options.fallbackWidth, options.fallbackDepth, floorY);

  const points = worldPoints.map((point) => roundPoint({ x: point.x / scale, z: point.z / scale }));
  const size = dimensions(points);
  if (size.width < 0.15 || size.depth < 0.15) {
    return fallbackResult(options.fallbackWidth, options.fallbackDepth, floorY);
  }
  return {
    points,
    width: size.width,
    depth: size.depth,
    floorY,
    confidence: validCount / rayCount,
    usedFallback: false,
  };
}
