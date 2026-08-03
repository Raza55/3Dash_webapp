import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { LightPosition, RoomConfig } from '../types';
import type { HAAreaRegistryEntry, HARoomEntity } from '../services/haAreaRegistry';
import { rankRoomEntities, type RoomEntityGroup } from '../utils/roomEntityPriority';
import { AccordionSection, FormPanel } from './FormPanel';
import { SliderNumberRow, VectorSliderFields } from './EditorSliderControls';
import { useTranslation } from '../contexts/LanguageContext';

export interface RoomPreviewInfo {
  size: { width: number; height: number; depth: number };
  rotation: LightPosition;
}

export interface RoomFormHandle {
  updateSize: (size: { width: number; height: number; depth: number }) => void;
  updateRotation: (rotation: LightPosition) => void;
}

interface Props {
  open: boolean;
  room: RoomConfig | null;
  isNew: boolean;
  position: LightPosition;
  areas: HAAreaRegistryEntry[];
  entities: HARoomEntity[];
  placedEntityIds: ReadonlySet<string>;
  defaultZone: { width: number; height: number; depth: number };
  placingMode: boolean;
  onPositionChange: (position: LightPosition) => void;
  onPreviewChange: (info: RoomPreviewInfo) => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onSave: (room: RoomConfig) => void;
  onClose: () => void;
}

const GROUPS: RoomEntityGroup[] = ['safety', 'controls', 'climate', 'media', 'status', 'other'];

const RoomForm = forwardRef<RoomFormHandle, Props>(function RoomForm({
  open, room, isNew, position, areas, entities, placedEntityIds, defaultZone, placingMode,
  onPositionChange, onPreviewChange, onEnterPlacingMode, onExitPlacingMode, onSave, onClose,
}, ref) {
  const t = useTranslation();
  const [name, setName] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [width, setWidth] = useState(defaultZone.width);
  const [height, setHeight] = useState(defaultZone.height);
  const [depth, setDepth] = useState(defaultZone.depth);
  const [rotationY, setRotationY] = useState(0);
  const [primaryEntityIds, setPrimaryEntityIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selectionTouched, setSelectionTouched] = useState(false);

  const roomEntities = useMemo(
    () => rankRoomEntities(entities.filter((entity) => areaIds.includes(entity.area_id)), placedEntityIds),
    [areaIds, entities, placedEntityIds],
  );

  useImperativeHandle(ref, () => ({
    updateSize: (size) => {
      setWidth(parseFloat(Math.max(0.1, size.width).toFixed(3)));
      setHeight(parseFloat(Math.max(0.01, size.height).toFixed(3)));
      setDepth(parseFloat(Math.max(0.1, size.depth).toFixed(3)));
    },
    updateRotation: (rotation) => setRotationY(parseFloat(rotation.y.toFixed(1))),
  }));

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? '');
    setAreaIds(room?.haAreaIds ?? []);
    setWidth(room?.zone.width ?? defaultZone.width);
    setHeight(room?.zone.height ?? defaultZone.height);
    setDepth(room?.zone.depth ?? defaultZone.depth);
    setRotationY(room?.zone.rotationY ?? 0);
    setPrimaryEntityIds(room?.primaryEntityIds ?? []);
    setShowAll(false);
    setSelectionTouched(!isNew);
  }, [defaultZone.depth, defaultZone.height, defaultZone.width, isNew, open, room]);

  useEffect(() => {
    if (!open || selectionTouched || !areaIds.length) return;
    setPrimaryEntityIds(roomEntities.slice(0, 8).map((entity) => entity.entity_id));
  }, [areaIds.length, open, roomEntities, selectionTouched]);

  useEffect(() => {
    if (!open) return;
    onPreviewChange({ size: { width, height, depth }, rotation: { x: 0, y: rotationY, z: 0 } });
  }, [depth, height, onPreviewChange, open, rotationY, width]);

  const toggleArea = (areaId: string) => {
    const adding = !areaIds.includes(areaId);
    if (adding && (!name.trim() || name === t('rooms.newName'))) {
      const area = areas.find((entry) => entry.area_id === areaId);
      if (area) setName(area.name);
    }
    setAreaIds((current) => current.includes(areaId) ? current.filter((id) => id !== areaId) : [...current, areaId]);
  };

  const toggleEntity = (entityId: string) => {
    setSelectionTouched(true);
    setPrimaryEntityIds((current) => current.includes(entityId)
      ? current.filter((id) => id !== entityId)
      : [...current, entityId]);
  };

  const handleSave = () => {
    if (!room) return;
    if (!name.trim()) { alert(t('rooms.nameRequired')); return; }
    if (!areaIds.length) { alert(t('rooms.areaRequired')); return; }
    const rankedIds = roomEntities.map((entity) => entity.entity_id);
    const orderedPrimaryIds = rankedIds.filter((entityId) => primaryEntityIds.includes(entityId));
    onSave({
      ...room,
      name: name.trim(),
      haAreaIds: areaIds,
      anchor: position,
      zone: { width, height, depth, rotationY },
      primaryEntityIds: orderedPrimaryIds,
    });
  };

  const visibleEntities = showAll ? roomEntities : roomEntities.slice(0, 16);
  const footer = (
    <>
      <button className="btn btn-primary" onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}>
        {placingMode ? t('form.cancelPlacement') : t('rooms.placeCentre')}
      </button>
      <button className="btn btn-success" onClick={handleSave}>{t('common.save')}</button>
      <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
    </>
  );

  return (
    <FormPanel open={open} title={isNew ? t('rooms.add') : t('rooms.edit')} onClose={onClose} footer={footer}>
      <AccordionSection title={t('rooms.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('rooms.name')}</label>
          <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
      </AccordionSection>

      <AccordionSection title={t('rooms.haAreas')} defaultOpen>
        <div className="room-area-checklist">
          {areas.map((area) => (
            <label className="room-check-row" key={area.area_id}>
              <input type="checkbox" checked={areaIds.includes(area.area_id)} onChange={() => toggleArea(area.area_id)} />
              <span>{area.name}</span>
            </label>
          ))}
          {!areas.length && <div className="room-form-note">{t('rooms.noAreas')}</div>}
        </div>
      </AccordionSection>

      <AccordionSection title={t('rooms.zone')} defaultOpen>
        <SliderNumberRow label={t('form.width')} value={width} onChange={setWidth} step={0.01} span={1.5} min={0.1} max={50} fallback={1} />
        <SliderNumberRow label={t('form.depth')} value={depth} onChange={setDepth} step={0.01} span={1.5} min={0.1} max={50} fallback={1} />
        <SliderNumberRow label={t('rooms.rotation')} value={rotationY} onChange={setRotationY} step={0.5} span={45} min={-180} max={180} />
      </AccordionSection>

      <AccordionSection title={t('form.position')} defaultOpen>
        <div className="placement-hint visible">{t('rooms.positionHint')}</div>
        <VectorSliderFields label={t('form.position')} value={position} onChange={onPositionChange} step={0.01} span={2} axisLabels={{ x: 'X', y: 'Z', z: 'Y' }} axisColors={{ x: '#f87171', y: '#4ade80', z: '#38bdf8' }} hideLabel />
      </AccordionSection>

      <AccordionSection title={t('rooms.primaryEntities')} defaultOpen>
        <div className="room-form-note">{t('rooms.priorityHint')}</div>
        {GROUPS.map((group) => {
          const grouped = visibleEntities.filter((entity) => entity.group === group);
          if (!grouped.length) return null;
          return (
            <div className="room-entity-group" key={group}>
              <div className="room-entity-group-title">{t(`rooms.group.${group}`)}</div>
              {grouped.map((entity) => (
                <label className="room-entity-row" key={entity.entity_id}>
                  <input type="checkbox" checked={primaryEntityIds.includes(entity.entity_id)} onChange={() => toggleEntity(entity.entity_id)} />
                  <span className="room-entity-copy">
                    <span className="room-entity-name">{entity.friendly_name || entity.entity_id}</span>
                    <span className="room-entity-meta">
                      {entity.entity_id}{placedEntityIds.has(entity.entity_id) ? ` · ${t('rooms.placed3d')}` : ''}
                    </span>
                  </span>
                  <span className={`room-entity-state ${entity.state === 'unavailable' ? 'unavailable' : ''}`}>{entity.state ?? '--'}</span>
                </label>
              ))}
            </div>
          );
        })}
        {!roomEntities.length && areaIds.length > 0 && <div className="room-form-note">{t('rooms.noEntities')}</div>}
        {roomEntities.length > 16 && (
          <button className="btn btn-ghost room-show-all" onClick={() => setShowAll((value) => !value)}>
            {showAll ? t('rooms.showRecommended') : t('rooms.showAll', { count: roomEntities.length })}
          </button>
        )}
      </AccordionSection>
    </FormPanel>
  );
});

export default RoomForm;
