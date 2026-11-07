import {
  ArrowUpRight,
  Circle,
  Frame,
  Hand,
  ImagePlus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  StickyNote,
  Type,
  Undo2,
} from 'lucide-react';
import { ToolType } from '../../types/board';
import { t } from '../../lib/content';
import { IconButton } from '../ui';

interface ToolbarProps {
  currentTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  currentColor: string;
  onSelectColor: (color: string) => void;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  readOnly?: boolean;
}
const tools = [
  { id: 'select', icon: MousePointer2, key: 'V' },
  { id: 'pan', icon: Hand, key: 'H' },
  { id: 'sticky', icon: StickyNote, key: 'S' },
  { id: 'text', icon: Type, key: 'T' },
  { id: 'rectangle', icon: Square, key: 'R' },
  { id: 'circle', icon: Circle, key: 'O' },
  { id: 'arrow', icon: ArrowUpRight, key: 'A' },
  { id: 'pen', icon: Pencil, key: 'P' },
  { id: 'frame', icon: Frame, key: 'F' },
  { id: 'image', icon: ImagePlus, key: '' },
] as const;
const colors = ['#24332e', '#be4c3c', '#326cc0', '#31705a', '#996600', '#80508b'];
export function Toolbar(props: ToolbarProps) {
  return (
    <div className="drawing-toolbar" role="toolbar" aria-label={t('tool.tools')}>
      <div className="tool-group">
        {tools
          .filter((tool) => !props.readOnly || ['select', 'pan'].includes(tool.id))
          .map((tool) => (
            <IconButton
              key={tool.id}
              label={t(`tool.${tool.id}`)}
              title={`${t(`tool.${tool.id}`)} ${tool.key}`}
              aria-pressed={props.currentTool === tool.id}
              className={props.currentTool === tool.id ? 'active' : ''}
              onClick={() => props.onSelectTool(tool.id)}
            >
              <tool.icon size={20} strokeWidth={1.7} />
            </IconButton>
          ))}
      </div>
      {!props.readOnly && (
        <>
          <div className="tool-divider" />
          <div className="color-group" role="group" aria-label={t('tool.colors')}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className="color-button"
                aria-label={t('tool.color', { color })}
                aria-pressed={props.currentColor === color}
                onClick={() => props.onSelectColor(color)}
              >
                <span style={{ background: color }} />
              </button>
            ))}
          </div>
          <div className="tool-divider" />
          <div className="tool-group undo-tools">
            <IconButton label={t('tool.undo')} disabled={!props.canUndo} onClick={props.undo}>
              <Undo2 size={19} />
            </IconButton>
            <IconButton label={t('tool.redo')} disabled={!props.canRedo} onClick={props.redo}>
              <Redo2 size={19} />
            </IconButton>
          </div>
        </>
      )}
    </div>
  );
}
