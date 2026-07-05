import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { BlindConfig, LightPosition } from '../types';
import { generateUUID } from '../utils/uuid';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { useTranslation } from '../contexts/LanguageContext';

export interface BlindPreviewInfo {
  size: { width: number; height: number; depth: number };
  rotationY: number;
  slats: number;
}

export interface BlindFormHandle {
  updateSize: (size: { width: number; height: number; depth: number }) => void;
  updateRotationY: (rotationY: number) => void;
}

interface Props {
  open: boolean;
  editBlind: BlindConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: BlindConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: BlindPreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const BlindForm = forwardRef<BlindFormHandle, Props>(function BlindForm({
  open,
  editBlind,
  position,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
}: Props, ref) {
  const t = useTranslation();
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(1.2);
  const [height, setHeight] = useState(1.6);
  const [depth, setDepth] = useState(0.04);
  const [rotationY, setRotationY] = useState(0);
  const [slats, setSlats] = useState(10);

  useImperativeHandle(ref, () => ({
    updateSize: (size) => {
      setWidth(parseFloat(Math.max(0.05, size.width).toFixed(3)));
      setHeight(parseFloat(Math.max(0.05, size.height).toFixed(3)));
      setDepth(parseFloat(Math.max(0.01, size.depth).toFixed(3)));
    },
    updateRotationY: (nextRotationY) => {
      setRotationY(parseFloat(nextRotationY.toFixed(1)));
    },
  }));

  useEffect(() => {
    if (!open) return;
    if (editBlind) {
      setEntityId(editBlind.entityId);
      setLabel(editBlind.label || '');
      setWidth(editBlind.size.width);
      setHeight(editBlind.size.height);
      setDepth(editBlind.size.depth);
      setRotationY(editBlind.rotationY ?? 0);
      setSlats(editBlind.slats ?? 10);
    } else {
      setEntityId('');
      setLabel('');
      setWidth(1.2);
      setHeight(1.6);
      setDepth(0.04);
      setRotationY(0);
      setSlats(10);
    }
  }, [open, editBlind]);

  useEffect(() => {
    if (!open) return;
    onPreviewChange({ size: { width, height, depth }, rotationY, slats });
  }, [open, width, height, depth, rotationY, slats]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    const id = entityId.trim();
    if (!id) {
      alert(t('common.requiredCoverEntityId'));
      return;
    }

    const cfg: BlindConfig = {
      id: editBlind?.id || generateUUID(),
      entityId: id,
      label: label.trim() || id.split('.')[1]?.replace(/_/g, ' ') || id,
      position,
      size: { width, height, depth },
      rotationY,
      slats,
    };
    onSave(cfg);
  }, [editBlind, entityId, label, position, width, height, depth, rotationY, slats, onSave, t]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? `\u2715 ${t('form.cancelPlacement')}` : `\u{1F4CD} ${t('form.clickModelToPlace')}`}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; {t('form.saveBlind')}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        {t('common.cancel')}
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editBlind ? t('form.editBlind') : t('form.addBlind')}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title={t('form.identity')} defaultOpen>
        <div className="field-group">
          <label className="field-label">{t('form.coverEntityId')}</label>
          <EntityPicker
            value={entityId}
            onChange={setEntityId}
            onSelect={(e) => { if (!label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
            placeholder="cover.living_room_blind"
            entities={haEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">{t('form.label')}</label>
          <input
            type="text"
            className="field-input"
            placeholder={t('placeholder.blindLabel')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.shape')} defaultOpen>
        <div className="row3">
          <div className="field-group">
            <label className="field-label">{t('form.width')}</label>
            <input
              type="number"
              className="field-input"
              step={0.05}
              min={0.05}
              value={width}
              onChange={(e) => setWidth(parseFloat(e.target.value) || 0.05)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">{t('form.height')}</label>
            <input
              type="number"
              className="field-input"
              step={0.05}
              min={0.05}
              value={height}
              onChange={(e) => setHeight(parseFloat(e.target.value) || 0.05)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">{t('form.depth')}</label>
            <input
              type="number"
              className="field-input"
              step={0.01}
              min={0.01}
              value={depth}
              onChange={(e) => setDepth(parseFloat(e.target.value) || 0.01)}
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">{t('form.rotation', { value: rotationY })}</label>
          <input
            type="range"
            className="pos-slider"
            min={-180}
            max={180}
            step={1}
            value={rotationY}
            onChange={(e) => setRotationY(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="field-group">
          <label className="field-label">{t('form.slats', { value: slats })}</label>
          <input
            type="range"
            className="pos-slider"
            min={1}
            max={30}
            step={1}
            value={slats}
            onChange={(e) => setSlats(parseInt(e.target.value, 10))}
          />
        </div>
      </AccordionSection>

      <AccordionSection title={t('form.position')} defaultOpen>
        <div
          className={`placement-hint${open ? ' visible' : ''}`}
          dangerouslySetInnerHTML={{ __html: t('form.placementHintModel') }}
        />

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, range: [-30, 30] as [number, number] },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, range: [-2, 10] as [number, number] },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, range: [-30, 30] as [number, number] },
        ]).map(({ label: lbl, color, babylonAxis, range }) => (
          <div key={babylonAxis} className="pos-grid">
            <span className="pos-axis" style={{ color }}>{lbl}</span>
            <input
              type="range"
              className="pos-slider"
              min={range[0]}
              max={range[1]}
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </AccordionSection>
    </FormPanel>
  );
});

export default BlindForm;
