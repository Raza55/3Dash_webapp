import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { LightConfig, LightType, LightPosition, LightPart, HitboxConfig, LightShape } from '../types';
import { fineSliderRange } from '../utils/editorControls';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { useTranslation } from '../contexts/LanguageContext';

interface PartState {
  shape: LightShape;
  diameter: number;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posY: number;
  posZ: number;
  rotation: LightPosition;
  scale: LightPosition;
}

const ZERO_ROTATION: LightPosition = { x: 0, y: 0, z: 0 };
const UNIT_SCALE: LightPosition = { x: 1, y: 1, z: 1 };
const NANOLEAF_DEFAULT_SIZE = { width: 1.15, height: 0.78, depth: 0.035 };
const LIGHT_DEFAULT_SIZE = {
  diameter: 0.18,
  width: 0.2,
  height: 0.2,
  depth: 0.2,
  hitboxDiameter: 0.45,
  hitboxBox: 0.4,
};

function cloneVector(v: LightPosition | undefined, fallback: LightPosition): LightPosition {
  return { x: v?.x ?? fallback.x, y: v?.y ?? fallback.y, z: v?.z ?? fallback.z };
}

function isZeroVector(v: LightPosition): boolean {
  return v.x === 0 && v.y === 0 && v.z === 0;
}

function isUnitVector(v: LightPosition): boolean {
  return v.x === 1 && v.y === 1 && v.z === 1;
}

function optionalRotation(v: LightPosition): LightPosition | undefined {
  return isZeroVector(v) ? undefined : v;
}

function optionalScale(v: LightPosition): LightPosition | undefined {
  return isUnitVector(v) ? undefined : v;
}

function VectorFields({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: LightPosition;
  onChange: (value: LightPosition) => void;
  min?: number;
  step: number;
}) {
  const update = (axis: keyof LightPosition, raw: string) => {
    const next = parseFloat(raw);
    onChange({ ...value, [axis]: Number.isFinite(next) ? next : value[axis] });
  };
  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <div className="row3">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div className="field-group" key={axis}>
            <label className="field-label">{axis.toUpperCase()}</label>
            <input
              type="number"
              className="field-input"
              min={min}
              step={step}
              value={value[axis]}
              onChange={(e) => update(axis, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const defaultPart = (pos: LightPosition, defaults = LIGHT_DEFAULT_SIZE): PartState => ({
  shape: 'cube',
  diameter: defaults.diameter,
  width: defaults.width,
  height: defaults.height,
  depth: defaults.depth,
  posX: pos.x,
  posY: pos.y,
  posZ: pos.z,
  rotation: cloneVector(undefined, ZERO_ROTATION),
  scale: cloneVector(undefined, UNIT_SCALE),
});

function partFromConfig(p: LightPart): PartState {
  const axisFallback = p.size?.diameter ?? 0.3;
  return {
    shape: p.shape,
    diameter: p.size?.diameter ?? 0.25,
    width: p.size?.width ?? axisFallback,
    height: p.size?.height ?? axisFallback,
    depth: p.size?.depth ?? axisFallback,
    posX: p.position.x,
    posY: p.position.y,
    posZ: p.position.z,
    rotation: cloneVector(p.rotation, ZERO_ROTATION),
    scale: cloneVector(p.scale, UNIT_SCALE),
  };
}

function partToConfig(p: PartState): LightPart {
  return {
    shape: p.shape,
    size: p.shape === 'sphere'
      ? { diameter: p.diameter }
      : { width: p.width, height: p.height, depth: p.depth },
    position: { x: p.posX, y: p.posY, z: p.posZ },
    rotation: optionalRotation(p.rotation),
    scale: optionalScale(p.scale),
  };
}

export interface PreviewInfo {
  shape: LightShape;
  size: Record<string, number>;
  rotation?: LightPosition;
  scale?: LightPosition;
  parts?: Array<{ shape: LightShape; size: Record<string, number>; position: LightPosition; rotation?: LightPosition; scale?: LightPosition }>;
  hitbox?: {
    shape: LightShape;
    size: Record<string, number>;
    position: LightPosition;
    rotation?: LightPosition;
    scale?: LightPosition;
  };
}

export interface LightFormHandle {
  updatePartPosition: (index: number, pos: LightPosition) => void;
  updateHitboxPosition: (pos: LightPosition) => void;
  updateVisualRotation: (rotation: LightPosition) => void;
  updateVisualScale: (scale: LightPosition) => void;
  updatePartRotation: (index: number, rotation: LightPosition) => void;
  updatePartScale: (index: number, scale: LightPosition) => void;
  updateHitboxRotation: (rotation: LightPosition) => void;
  updateHitboxScale: (scale: LightPosition) => void;
}

interface Props {
  open: boolean;
  editLight: LightConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (config: LightConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: PreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
  defaultSize?: typeof LIGHT_DEFAULT_SIZE;
  defaultNanoleafSize?: typeof NANOLEAF_DEFAULT_SIZE;
}

const LightForm = forwardRef<LightFormHandle, Props>(function LightForm({
  open,
  editLight,
  position,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
  defaultSize = LIGHT_DEFAULT_SIZE,
  defaultNanoleafSize = NANOLEAF_DEFAULT_SIZE,
}, ref) {
  const t = useTranslation();
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<LightType>('toggle');
  const [shape, setShape] = useState<LightShape>('sphere');
  const [diameter, setDiameter] = useState(0.25);
  const [width, setWidth] = useState(0.3);
  const [height, setHeight] = useState(0.3);
  const [depth, setDepth] = useState(0.3);
  const [rotation, setRotation] = useState<LightPosition>(() => cloneVector(undefined, ZERO_ROTATION));
  const [scale, setScale] = useState<LightPosition>(() => cloneVector(undefined, UNIT_SCALE));
  const [warmth, setWarmth] = useState(3000);
  const [brightness, setBrightness] = useState(1);
  const [doubleTapEntityId, setDoubleTapEntityId] = useState('');

  // Multi-part state
  const [multiPart, setMultiPart] = useState(false);
  const [parts, setParts] = useState<PartState[]>([]);

  // Hitbox state
  const [useCustomHitbox, setUseCustomHitbox] = useState(false);
  const [hbShape, setHbShape] = useState<LightShape>('sphere');
  const [hbDiameter, setHbDiameter] = useState(0.5);
  const [hbWidth, setHbWidth] = useState(0.5);
  const [hbHeight, setHbHeight] = useState(0.5);
  const [hbDepth, setHbDepth] = useState(0.5);
  const [hbPosX, setHbPosX] = useState(0);
  const [hbPosY, setHbPosY] = useState(2.5);
  const [hbPosZ, setHbPosZ] = useState(0);
  const [hbRotation, setHbRotation] = useState<LightPosition>(() => cloneVector(undefined, ZERO_ROTATION));
  const [hbScale, setHbScale] = useState<LightPosition>(() => cloneVector(undefined, UNIT_SCALE));

  // Notify tour when required fields are filled (fires on every change so Back navigation works)
  useEffect(() => {
    if (label.trim() && entityId.trim()) {
      document.dispatchEvent(new Event('tour:form-filled'));
    }
  }, [label, entityId]);

  // Expose imperative methods for gizmo-driven position updates
  useImperativeHandle(ref, () => ({
    updatePartPosition: (index: number, pos: LightPosition) => {
      setParts(prev => prev.map((p, i) => i === index ? { ...p, posX: pos.x, posY: pos.y, posZ: pos.z } : p));
    },
    updateHitboxPosition: (pos: LightPosition) => {
      setHbPosX(pos.x);
      setHbPosY(pos.y);
      setHbPosZ(pos.z);
    },
    updateVisualRotation: setRotation,
    updateVisualScale: setScale,
    updatePartRotation: (index: number, nextRotation: LightPosition) => {
      setParts(prev => prev.map((p, i) => i === index ? { ...p, rotation: nextRotation } : p));
    },
    updatePartScale: (index: number, nextScale: LightPosition) => {
      setParts(prev => prev.map((p, i) => i === index ? { ...p, scale: nextScale } : p));
    },
    updateHitboxRotation: setHbRotation,
    updateHitboxScale: setHbScale,
  }));

  // Populate form when editing, or reset when opening for a new light
  useEffect(() => {
    if (!open) return;
    if (editLight) {
      const axisFallback = editLight.size?.diameter ?? 0.3;
      const hitboxAxisFallback = editLight.hitbox?.size?.diameter ?? 0.5;
      setEntityId(editLight.entityId);
      setLabel(editLight.label || '');
      setType(editLight.type || 'toggle');
      setShape(editLight.shape || 'sphere');
      setDiameter(editLight.size?.diameter ?? 0.25);
      setWidth(editLight.size?.width ?? axisFallback);
      setHeight(editLight.size?.height ?? axisFallback);
      setDepth(editLight.size?.depth ?? axisFallback);
      setRotation(cloneVector(editLight.rotation, ZERO_ROTATION));
      setScale(cloneVector(editLight.scale, UNIT_SCALE));
      setWarmth(editLight.warmth ?? 3000);
      setBrightness(editLight.brightness ?? 1);
      setDoubleTapEntityId(editLight.doubleTapEntityId ?? '');
      const hasParts = editLight.parts && editLight.parts.length > 0;
      setMultiPart(!!hasParts);
      setParts(hasParts ? editLight.parts!.map(partFromConfig) : []);
      setUseCustomHitbox(!!editLight.hitbox);
      setHbShape(editLight.hitbox?.shape ?? 'sphere');
      setHbDiameter(editLight.hitbox?.size?.diameter ?? 0.5);
      setHbWidth(editLight.hitbox?.size?.width ?? hitboxAxisFallback);
      setHbHeight(editLight.hitbox?.size?.height ?? hitboxAxisFallback);
      setHbDepth(editLight.hitbox?.size?.depth ?? hitboxAxisFallback);
      setHbPosX(editLight.hitbox?.position?.x ?? editLight.position.x);
      setHbPosY(editLight.hitbox?.position?.y ?? editLight.position.y);
      setHbPosZ(editLight.hitbox?.position?.z ?? editLight.position.z);
      setHbRotation(cloneVector(editLight.hitbox?.rotation, ZERO_ROTATION));
      setHbScale(cloneVector(editLight.hitbox?.scale, UNIT_SCALE));
    } else {
      setEntityId('');
      setLabel('');
      setType('toggle');
      setShape('sphere');
      setDiameter(defaultSize.diameter);
      setWidth(defaultSize.width);
      setHeight(defaultSize.height);
      setDepth(defaultSize.depth);
      setRotation(cloneVector(undefined, ZERO_ROTATION));
      setScale(cloneVector(undefined, UNIT_SCALE));
      setWarmth(3000);
      setBrightness(1);
      setDoubleTapEntityId('');
      setMultiPart(false);
      setParts([]);
      setUseCustomHitbox(false);
      setHbShape('sphere');
      setHbDiameter(defaultSize.hitboxDiameter);
      setHbWidth(defaultSize.hitboxBox);
      setHbHeight(defaultSize.hitboxBox);
      setHbDepth(defaultSize.hitboxBox);
      setHbPosX(0);
      setHbPosY(2.5);
      setHbPosZ(0);
      setHbRotation(cloneVector(undefined, ZERO_ROTATION));
      setHbScale(cloneVector(undefined, UNIT_SCALE));
    }
  }, [editLight, open, defaultSize.diameter, defaultSize.width, defaultSize.height, defaultSize.depth, defaultSize.hitboxDiameter, defaultSize.hitboxBox]);

  // Notify parent of shape/size changes for preview mesh
  useEffect(() => {
    if (!open) return;
    const size: Record<string, number> = shape === 'sphere'
      ? { diameter }
      : { width, height, depth };
    const hitbox = (useCustomHitbox || multiPart)
      ? {
          shape: hbShape,
          size: hbShape === 'sphere' ? { diameter: hbDiameter } as Record<string, number> : { width: hbWidth, height: hbHeight, depth: hbDepth } as Record<string, number>,
          position: { x: hbPosX, y: hbPosY, z: hbPosZ },
          rotation: optionalRotation(hbRotation),
          scale: optionalScale(hbScale),
        }
      : undefined;
    const partsPreview = multiPart && parts.length > 0
      ? parts.map(p => ({
          shape: p.shape,
          size: p.shape === 'sphere'
            ? { diameter: p.diameter } as Record<string, number>
            : { width: p.width, height: p.height, depth: p.depth } as Record<string, number>,
          position: { x: p.posX, y: p.posY, z: p.posZ },
          rotation: optionalRotation(p.rotation),
          scale: optionalScale(p.scale),
        }))
      : undefined;
    onPreviewChange({ shape, size, rotation: optionalRotation(rotation), scale: optionalScale(scale), parts: partsPreview, hitbox });
  }, [shape, diameter, width, height, depth, rotation, scale, open, useCustomHitbox, multiPart, parts, hbShape, hbDiameter, hbWidth, hbHeight, hbDepth, hbPosX, hbPosY, hbPosZ, hbRotation, hbScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    const id = entityId.trim();
    if (!id) {
      alert(t('common.requiredEntityId'));
      return;
    }

    const size = shape === 'sphere'
      ? { diameter }
      : { width, height, depth };

    const hitbox: HitboxConfig | undefined = (useCustomHitbox || multiPart)
      ? {
          shape: hbShape,
          size: hbShape === 'sphere' ? { diameter: hbDiameter } : { width: hbWidth, height: hbHeight, depth: hbDepth },
          position: { x: hbPosX, y: hbPosY, z: hbPosZ },
          rotation: optionalRotation(hbRotation),
          scale: optionalScale(hbScale),
        }
      : undefined;

    const cfg: LightConfig = {
      entityId: id,
      label: label.trim() || id.split('.')[1] || id,
      type,
      shape,
      size,
      position,
      rotation: optionalRotation(rotation),
      scale: optionalScale(scale),
      warmth: (type === 'toggle' || type === 'dimmeable' || type === 'remote') ? warmth : undefined,
      brightness,
      hitbox,
      doubleTapEntityId: doubleTapEntityId.trim() || undefined,
    };

    if (multiPart && parts.length > 0) {
      cfg.parts = parts.map(partToConfig);
    }

    // Preserve fields from the original config when editing
    if (editLight) {
      if (editLight.group) cfg.group = editLight.group;
      if (type === 'remote') {
        if (editLight.remoteButtons) cfg.remoteButtons = editLight.remoteButtons;
        if (editLight.modeEntityId) cfg.modeEntityId = editLight.modeEntityId;
      }
    }

    onSave(cfg);
  }, [entityId, label, type, shape, diameter, width, height, depth, position, rotation, scale, warmth, brightness, doubleTapEntityId, onSave, useCustomHitbox, multiPart, parts, hbShape, hbDiameter, hbWidth, hbHeight, hbDepth, hbPosX, hbPosY, hbPosZ, hbRotation, hbScale, t]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: value });
    },
    [position, onPositionChange],
  );

  const updatePart = useCallback((idx: number, update: Partial<PartState>) => {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, ...update } : p));
  }, []);

  const addPart = useCallback(() => {
    setParts(prev => [...prev, defaultPart(position, defaultSize)]);
  }, [defaultSize, position]);

  const removePart = useCallback((idx: number) => {
    setParts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const applyNanoleafDefaults = useCallback(() => {
    setShape('nanoleafShapes');
    setWidth(defaultNanoleafSize.width);
    setHeight(defaultNanoleafSize.height);
    setDepth(defaultNanoleafSize.depth);
    setBrightness((prev) => Math.max(prev, 1.2));
  }, [defaultNanoleafSize.depth, defaultNanoleafSize.height, defaultNanoleafSize.width]);

  const handleTypeChange = useCallback((nextType: LightType) => {
    setType(nextType);
    if (nextType === 'nanoleafShapes') {
      applyNanoleafDefaults();
    }
  }, [applyNanoleafDefaults]);

  const handleShapeChange = useCallback((nextShape: LightShape) => {
    setShape(nextShape);
    if (nextShape === 'nanoleafShapes') {
      setWidth(defaultNanoleafSize.width);
      setHeight(defaultNanoleafSize.height);
      setDepth(defaultNanoleafSize.depth);
    }
  }, [defaultNanoleafSize.depth, defaultNanoleafSize.height, defaultNanoleafSize.width]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? `\u2715 ${t('form.cancelPlacement')}` : `\u{1F4CD} ${t('form.clickModelToPlace')}`}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; {t('form.saveLight')}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editLight ? t('form.editLight') : t('form.addLight')}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title={t('form.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('form.entityId')}</label>
          <EntityPicker
            value={entityId}
            onChange={setEntityId}
            onSelect={(e) => { if (!label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
            placeholder="light.salon"
            entities={haEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">{t('form.labelDisplayName')}</label>
          <input
            type="text"
            className="field-input"
            placeholder="Salon"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">{t('form.lightType')}</label>
          <select
            className="field-select"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as LightType)}
          >
            <option value="toggle">{t('form.toggleType')}</option>
            <option value="dimmeable">{t('form.dimmedType')}</option>
            <option value="warmCold">{t('form.warmColdType')}</option>
            <option value="rgb">RGB</option>
            <option value="rgbw">RGBW</option>
            <option value="nanoleafShapes">{t('form.nanoleafShapesType')}</option>
            <option value="remote">{t('form.remoteType')}</option>
          </select>
        </div>

        {(type === 'toggle' || type === 'dimmeable' || type === 'remote') && (
          <div className="field-group">
            <label className="field-label">{t('form.baseWarmth', { value: warmth })}</label>
            <input
              type="range"
              className="pos-slider"
              min={2000}
              max={6500}
              step={100}
              value={warmth}
              onChange={(e) => setWarmth(parseInt(e.target.value))}
            />
          </div>
        )}

        <div className="field-group">
          <label className="field-label">{t('form.brightnessMultiplier', { value: brightness })}</label>
          <input
            type="number"
            className="field-input"
            min={0.1}
            max={1000}
            step={0.1}
            value={brightness}
            onChange={(e) => setBrightness(Math.max(0.1, parseFloat(e.target.value) || 1))}
          />
        </div>

        <div className="field-group">
          <label className="field-label">{t('form.doubleTapEntityId')}</label>
          <EntityPicker
            value={doubleTapEntityId}
            onChange={setDoubleTapEntityId}
            placeholder="fan.ceiling_fan (optional)"
            entities={haEntities}
            className="field-input"
          />
          <span className="field-label" style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
            {t('form.doubleTapHint')}
          </span>
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.shape')}>
        <div className="field-group">
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={multiPart}
              onChange={(e) => {
                const on = e.target.checked;
                setMultiPart(on);
                if (on && parts.length === 0) {
                  setParts([{
                    shape,
                    diameter,
                    width,
                    height,
                    depth,
                    posX: position.x,
                    posY: position.y,
                    posZ: position.z,
                    rotation: cloneVector(rotation, ZERO_ROTATION),
                    scale: cloneVector(scale, UNIT_SCALE),
                  }]);
                  if (!useCustomHitbox) {
                    setUseCustomHitbox(true);
                    setHbPosX(position.x);
                    setHbPosY(position.y);
                    setHbPosZ(position.z);
                  }
                }
              }}
            />
            {t('form.multiPart')}
          </label>
        </div>

        {multiPart ? (
          <>
            {parts.map((part, idx) => (
              <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="field-label" style={{ fontWeight: 'bold' }}>{t('form.part', { number: idx + 1 })}</span>
                  {parts.length > 1 && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: 11 }}
                      onClick={() => removePart(idx)}
                    >
                      &#10005;
                    </button>
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label">{t('form.shape')}</label>
                  <select
                    className="field-select"
                    value={part.shape}
                    onChange={(e) => {
                      const nextShape = e.target.value as LightShape;
                      updatePart(idx, nextShape === 'nanoleafShapes'
                        ? { shape: nextShape, ...defaultNanoleafSize }
                        : { shape: nextShape });
                    }}
                  >
                    <option value="sphere">{t('form.sphere')}</option>
                    <option value="cube">{t('form.cube')}</option>
                    <option value="ellipsoid">{t('form.ellipsoid')}</option>
                    <option value="nanoleafShapes">{t('form.nanoleafShapes')}</option>
                  </select>
                </div>

                {part.shape === 'sphere' ? (
                  <div className="field-group">
                    <label className="field-label">{t('form.diameter')}</label>
                    <input
                      type="number"
                      className="field-input"
                      value={part.diameter}
                      step={0.05}
                      min={0.05}
                      max={2}
                      onChange={(e) => updatePart(idx, { diameter: parseFloat(e.target.value) || 0.25 })}
                    />
                  </div>
                ) : (
                  <div className="row3">
                    <div className="field-group">
                      <label className="field-label">W</label>
                      <input type="number" className="field-input" value={part.width} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { width: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">H</label>
                      <input type="number" className="field-input" value={part.height} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { height: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">D</label>
                      <input type="number" className="field-input" value={part.depth} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { depth: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                  </div>
                )}

                <div className="field-label" style={{ marginTop: 4, marginBottom: 2 }}>{t('form.position')}</div>
                {([
                  { label: 'X', color: '#f87171', key: 'posX' as const, span: 2 },
                  { label: 'Z', color: '#4ade80', key: 'posY' as const, span: 0.8 },
                  { label: 'Y', color: '#38bdf8', key: 'posZ' as const, span: 2 },
                ]).map(({ label: axLabel, color, key, span }) => {
                  const range = fineSliderRange(part[key], span);
                  return (
                    <div key={`part-${idx}-${key}`} className="pos-grid">
                      <span className="pos-axis" style={{ color }}>{axLabel}</span>
                      <input
                        type="range"
                        className="pos-slider"
                        min={range.min}
                        max={range.max}
                        step={0.01}
                        value={part[key]}
                        onChange={(e) => updatePart(idx, { [key]: parseFloat(e.target.value) })}
                      />
                      <input
                        type="number"
                        className="pos-num"
                        step={0.01}
                        value={part[key]}
                        onChange={(e) => updatePart(idx, { [key]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  );
                })}

                <VectorFields
                  label={t('form.visualRotation')}
                  value={part.rotation}
                  step={5}
                  onChange={(value) => updatePart(idx, { rotation: value })}
                />
                <VectorFields
                  label={t('form.visualScale')}
                  value={part.scale}
                  min={0.001}
                  step={0.1}
                  onChange={(value) => updatePart(idx, { scale: value })}
                />
              </div>
            ))}
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={addPart}
            >
              {t('form.addPart')}
            </button>
          </>
        ) : (
          <>
            <div className="field-group">
              <label className="field-label">{t('form.shape')}</label>
              <select
                className="field-select"
                value={shape}
                onChange={(e) => handleShapeChange(e.target.value as LightShape)}
              >
                <option value="sphere">{t('form.sphere')}</option>
                <option value="cube">{t('form.cube')}</option>
                <option value="ellipsoid">{t('form.ellipsoid')}</option>
                <option value="nanoleafShapes">{t('form.nanoleafShapes')}</option>
              </select>
            </div>

            {shape === 'sphere' ? (
              <div className="field-group">
                <label className="field-label">{t('form.diameter')}</label>
                <input
                  type="number"
                  className="field-input"
                  value={diameter}
                  step={0.05}
                  min={0.05}
                  max={2}
                  onChange={(e) => setDiameter(parseFloat(e.target.value) || 0.25)}
                />
              </div>
            ) : (
              <div className="row3">
                <div className="field-group">
                  <label className="field-label">{t('form.width')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={width}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setWidth(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('form.height')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={height}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHeight(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('form.depth')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={depth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setDepth(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
              </div>
            )}

            <VectorFields
              label={t('form.visualRotation')}
              value={rotation}
              step={5}
              onChange={setRotation}
            />
            <VectorFields
              label={t('form.visualScale')}
              value={scale}
              min={0.001}
              step={0.1}
              onChange={setScale}
            />
          </>
        )}
      </AccordionSection>

      <AccordionSection title={t('form.hitbox')}>
        {!multiPart && (
          <div className="field-group">
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={useCustomHitbox}
                onChange={(e) => setUseCustomHitbox(e.target.checked)}
              />
              {t('form.customHitbox')}
            </label>
          </div>
        )}
        {multiPart && (
          <div className="field-group">
            <span className="field-label" style={{ opacity: 0.6, fontSize: 11 }}>
              {t('form.multiPartHitboxRequired')}
            </span>
          </div>
        )}

        {(useCustomHitbox || multiPart) && (
          <>
            <div className="field-group">
              <label className="field-label">{t('form.hitboxShape')}</label>
              <select
                className="field-select"
                value={hbShape}
                onChange={(e) => setHbShape(e.target.value as LightShape)}
              >
                <option value="sphere">{t('form.sphere')}</option>
                <option value="cube">{t('form.cube')}</option>
                <option value="ellipsoid">{t('form.ellipsoid')}</option>
                <option value="nanoleafShapes">{t('form.nanoleafShapes')}</option>
              </select>
            </div>

            {hbShape === 'sphere' ? (
              <div className="field-group">
                <label className="field-label">{t('form.hitboxDiameter')}</label>
                <input
                  type="number"
                  className="field-input"
                  value={hbDiameter}
                  step={0.05}
                  min={0.05}
                  onChange={(e) => setHbDiameter(parseFloat(e.target.value) || 0.5)}
                />
              </div>
            ) : (
              <div className="row3">
                <div className="field-group">
                  <label className="field-label">{t('form.width')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbWidth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbWidth(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('form.height')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbHeight}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbHeight(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('form.depth')}</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbDepth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbDepth(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
              </div>
            )}

            <span className="field-label" style={{ marginTop: 4 }}>{t('form.hitboxPosition')}</span>
            {([
              { label: 'X', color: '#f87171', axis: 'x' as const, value: hbPosX, setter: setHbPosX, span: 2 },
              { label: 'Z', color: '#4ade80', axis: 'y' as const, value: hbPosY, setter: setHbPosY, span: 0.8 },
              { label: 'Y', color: '#38bdf8', axis: 'z' as const, value: hbPosZ, setter: setHbPosZ, span: 2 },
            ]).map(({ label: axLabel, color, axis, value, setter, span }) => {
              const range = fineSliderRange(value, span);
              return (
                <div key={`hb-${axis}`} className="pos-grid">
                  <span className="pos-axis" style={{ color }}>{axLabel}</span>
                  <input
                    type="range"
                    className="pos-slider"
                    min={range.min}
                    max={range.max}
                    step={0.01}
                    value={value}
                    onChange={(e) => setter(parseFloat(e.target.value))}
                  />
                  <input
                    type="number"
                    className="pos-num"
                    step={0.01}
                    value={value}
                    onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                  />
                </div>
              );
            })}

            <VectorFields
              label={t('form.visualRotation')}
              value={hbRotation}
              step={5}
              onChange={setHbRotation}
            />
            <VectorFields
              label={t('form.visualScale')}
              value={hbScale}
              min={0.001}
              step={0.1}
              onChange={setHbScale}
            />
          </>
        )}
      </AccordionSection>

      <AccordionSection title={t('form.position')} defaultOpen>
        <div
          className={`placement-hint${open ? ' visible' : ''}`}
          dangerouslySetInnerHTML={{ __html: t('form.placementHintModel') }}
        />

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, span: 2 },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, span: 0.8 },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, span: 2 },
        ]).map(({ label, color, babylonAxis, span }) => {
          const range = fineSliderRange(position[babylonAxis], span);
          return (
            <div key={babylonAxis} className="pos-grid">
              <span className="pos-axis" style={{ color }}>
                {label}
              </span>
              <input
                type="range"
                className="pos-slider"
                min={range.min}
                max={range.max}
                step={0.01}
                value={position[babylonAxis]}
                onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={0.01}
                value={position[babylonAxis]}
                onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value) || 0)}
              />
            </div>
          );
        })}
      </AccordionSection>
    </FormPanel>
  );
});

export default LightForm;
