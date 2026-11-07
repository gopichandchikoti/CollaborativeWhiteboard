import { Copy, Layers, Trash2 } from 'lucide-react';
import { BoardItem } from '../types/board';
import { t } from '../lib/content';
import { IconButton } from './ui';
import { resizeItem } from './Canvas/viewport';
import { moveItem } from './Canvas/geometry';

interface InspectorProps {
  item: BoardItem;
  onChange: (item: BoardItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  editing: boolean;
  onFront: () => void;
  onBack: () => void;
}
export function Inspector({ item, onChange, onDelete, onDuplicate, editing, onFront, onBack }: InspectorProps) {
  return (
    <aside className="inspector" aria-label={t('selection.title')}>
      <div className="inspector-heading">
        <strong>{t(`tool.${item.type}`)}</strong>
        <div>
          <IconButton label={t('selection.duplicate')} onClick={onDuplicate}>
            <Copy size={16} />
          </IconButton>
          <IconButton label={t('selection.delete')} onClick={onDelete}>
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>
      <form
        key={`${item.id}:${item.width}:${item.height}:${item.x}:${item.y}`}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const moved = moveItem(item, { x: Number(data.get('x')) - item.x, y: Number(data.get('y')) - item.y });
          const resized = resizeItem(moved, {
            x: moved.x + Number(data.get('width')),
            y: moved.y + Number(data.get('height')),
          });
          onChange({ ...resized, text: String(data.get('text') ?? item.text ?? '') });
        }}
      >
        {item.type !== 'image' && (
          <label>
            {t('selection.text')}
            <textarea
              id="object-text"
              name="text"
              rows={3}
              defaultValue={item.text ?? ''}
              maxLength={4000}
              autoFocus={editing}
            />
          </label>
        )}
        <div className="dimension-grid">
          {(['x', 'y', 'width', 'height'] as const).map((key) => (
            <label key={key}>
              {t(`selection.${key}`)}
              <input
                name={key}
                type="number"
                step="any"
                required
                defaultValue={Math.round(item[key] * 100) / 100}
                min={key === 'width' || key === 'height' ? 20 : -1000000}
                max={key === 'width' || key === 'height' ? 100000 : 1000000}
              />
            </label>
          ))}
        </div>
        <button className="primary-button full-width">{t('common.save')}</button>
      </form>
      <div className="layer-controls">
        <button className="text-button" onClick={onFront}>
          <Layers size={15} />
          {t('selection.front')}
        </button>
        <button className="text-button" onClick={onBack}>
          {t('selection.back')}
        </button>
      </div>
    </aside>
  );
}
