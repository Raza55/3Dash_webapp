import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

export type ModelObjectEditMode = 'move' | 'rotate' | 'scale';

export interface ModelObjectListItem {
  id: string;
  label: string;
  kind?: 'model' | 'uploaded';
}

interface Props {
  objects: ModelObjectListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onResetSelected: () => void;
  onUploadObject: (file: File) => void;
  onDeleteSelected?: () => void;
}

export default function ModelObjectList({
  objects,
  selectedId,
  onSelect,
  onResetSelected,
  onUploadObject,
  onDeleteSelected,
}: Props) {
  const t = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const selected = objects.find((obj) => obj.id === selectedId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((obj) =>
      obj.label.toLowerCase().includes(q) || obj.id.toLowerCase().includes(q),
    );
  }, [objects, query]);

  return (
    <>
      <div className="model-object-tools">
        <input
          className="field-input"
          type="search"
          placeholder={t('modelObjects.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn btn-ghost"
          disabled={!selectedId}
          onClick={onResetSelected}
        >
          {t('modelObjects.resetSelected')}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => uploadInputRef.current?.click()}
        >
          {t('modelObjects.uploadObject')}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".glb,.gltf,.obj,.stl,.fbx"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadObject(file);
            e.target.value = '';
          }}
        />
        {selected?.kind === 'uploaded' && onDeleteSelected ? (
          <button
            className="btn btn-ghost"
            onClick={onDeleteSelected}
          >
            {t('modelObjects.deleteSelected')}
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="list-empty">{t('modelObjects.noneFound')}</div>
      ) : (
        filtered.map((obj) => (
          <button
            key={obj.id}
            className={`light-item model-object-item${selectedId === obj.id ? ' selected' : ''}`}
            onClick={() => onSelect(obj.id)}
            title={obj.id}
          >
            <span className="light-item-icon">M</span>
            <span className="light-item-info">
              <span className="light-item-name">{obj.label}</span>
              <span className="light-item-meta">
                {obj.kind === 'uploaded' ? t('modelObjects.uploaded') : obj.id}
              </span>
            </span>
          </button>
        ))
      )}
    </>
  );
}
