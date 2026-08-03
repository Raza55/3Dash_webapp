import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Tools,
  type Scene,
  type TransformNode,
} from '@babylonjs/core';
import type { RoomConfig } from '../types';

export interface RoomZoneMeshEntry {
  zone: Mesh;
  label: Mesh;
  zoneMaterial: StandardMaterial;
  labelMaterial: StandardMaterial;
  labelTexture: DynamicTexture;
}

export type RoomZoneMeshMap = Record<string, RoomZoneMeshEntry>;

export function removeRoomZoneMesh(map: RoomZoneMeshMap, roomId: string): void {
  const entry = map[roomId];
  if (!entry) return;
  entry.zone.dispose();
  entry.label.dispose();
  entry.zoneMaterial.dispose();
  entry.labelMaterial.dispose();
  entry.labelTexture.dispose();
  delete map[roomId];
}

export function disposeAllRoomZones(map: RoomZoneMeshMap): void {
  for (const roomId of Object.keys(map)) removeRoomZoneMesh(map, roomId);
}

export function createRoomZoneMesh(
  scene: Scene,
  room: RoomConfig,
  parent?: TransformNode,
  selected = false,
): RoomZoneMeshEntry {
  const height = Math.max(0.01, room.zone.height ?? 0.025);
  const zone = MeshBuilder.CreateBox(`room-zone-${room.id}`, {
    width: Math.max(0.1, room.zone.width),
    height,
    depth: Math.max(0.1, room.zone.depth),
  }, scene);
  zone.position.set(room.anchor.x, room.anchor.y + height / 2, room.anchor.z);
  zone.rotation.y = Tools.ToRadians(room.zone.rotationY ?? 0);
  zone.metadata = { roomId: room.id };
  zone.isPickable = true;
  if (parent) zone.parent = parent;

  const zoneMaterial = new StandardMaterial(`room-zone-material-${room.id}`, scene);
  zoneMaterial.diffuseColor = new Color3(0.08, 0.55, 0.82);
  zoneMaterial.emissiveColor = new Color3(0.04, 0.27, 0.42);
  zoneMaterial.alpha = selected ? 0.32 : 0.14;
  zoneMaterial.disableLighting = true;
  zone.material = zoneMaterial;
  zone.enableEdgesRendering();
  zone.edgesWidth = selected ? 4 : 2;
  zone.edgesColor = selected ? new Color4(0.2, 0.78, 1, 1) : new Color4(0.2, 0.65, 0.9, 0.7);

  const labelTexture = new DynamicTexture(`room-label-texture-${room.id}`, { width: 512, height: 128 }, scene, true);
  labelTexture.hasAlpha = true;
  labelTexture.getContext().clearRect(0, 0, 512, 128);
  labelTexture.drawText(room.name, null, 78, 'bold 42px Arial', '#e8f7ff', 'rgba(4, 15, 28, 0.82)', true, true);

  const label = MeshBuilder.CreatePlane(`room-label-${room.id}`, { width: 1.8, height: 0.45 }, scene);
  label.position.set(room.anchor.x, room.anchor.y + 0.28, room.anchor.z);
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.metadata = { roomId: room.id };
  label.isPickable = true;
  if (parent) label.parent = parent;

  const labelMaterial = new StandardMaterial(`room-label-material-${room.id}`, scene);
  labelMaterial.diffuseTexture = labelTexture;
  labelMaterial.emissiveColor = Color3.White();
  labelMaterial.opacityTexture = labelTexture;
  labelMaterial.disableLighting = true;
  labelMaterial.backFaceCulling = false;
  label.material = labelMaterial;

  return { zone, label, zoneMaterial, labelMaterial, labelTexture };
}

export function rebuildAllRoomZones(
  scene: Scene,
  map: RoomZoneMeshMap,
  rooms: RoomConfig[],
  parent?: TransformNode,
  selectedRoomId?: string | null,
): void {
  disposeAllRoomZones(map);
  for (const room of rooms) {
    map[room.id] = createRoomZoneMesh(scene, room, parent, room.id === selectedRoomId);
  }
}
