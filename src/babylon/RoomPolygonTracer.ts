import { Ray, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { RoomZonePoint } from '../types';

export interface RoomPolygonTraceResult {
  points: RoomZonePoint[];
  width: number;
  depth: number;
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

function fallbackResult(width: number, depth: number): RoomPolygonTraceResult {
  const points = [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ].map(roundPoint);
  return { points, width, depth, confidence: 0, usedFallback: true };
}

/**
 * Approximates the room boundary around a clicked floor point with horizontal rays.
 * Multiple probe heights reduce false stops on low furniture; the resulting radial
 * contour is smoothed and reduced to a small editable polygon.
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
  const probeHeights = [0.028, 0.065, 0.11].map((ratio) =>
    clamp(diagonal * ratio, diagonal * 0.012, diagonal * 0.15));
  const modelMeshSet = new Set(modelMeshes);
  const rawDistances: Array<number | null> = [];

  for (let index = 0; index < rayCount; index++) {
    const angle = (index / rayCount) * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const hits: number[] = [];
    for (const height of probeHeights) {
      const ray = new Ray(
        new Vector3(floorPoint.x, floorPoint.y + height, floorPoint.z),
        direction,
        maxDistance,
      );
      const pick = scene.pickWithRay(
        ray,
        (mesh) => modelMeshSet.has(mesh) && mesh.isEnabled() && mesh.isVisible,
        false,
      );
      if (pick?.hit && pick.distance > minimumDistance && pick.distance <= maxDistance) {
        hits.push(pick.distance);
      }
    }
    rawDistances.push(hits.length ? Math.max(...hits) : null);
  }

  const validCount = rawDistances.filter((value) => value !== null).length;
  const filled = fillMissingDistances(rawDistances);
  if (!filled) return fallbackResult(options.fallbackWidth, options.fallbackDepth);
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
  if (worldPoints.length < 3) return fallbackResult(options.fallbackWidth, options.fallbackDepth);

  const points = worldPoints.map((point) => roundPoint({ x: point.x / scale, z: point.z / scale }));
  const size = dimensions(points);
  if (size.width < 0.15 || size.depth < 0.15) {
    return fallbackResult(options.fallbackWidth, options.fallbackDepth);
  }
  return {
    points,
    width: size.width,
    depth: size.depth,
    confidence: validCount / rayCount,
    usedFallback: false,
  };
}
