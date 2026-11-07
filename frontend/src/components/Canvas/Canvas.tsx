import React, { useEffect, useRef, useState } from 'react';
import { BoardItem, ToolType, Point, Viewport } from '../../types/board';
import { createDraft, findItemAt, finishDraft, moveItem, updateDraft } from './geometry';
import { useCanvasRenderer } from './useCanvasRenderer';
import { t } from '../../lib/content';
import { resizeItem, worldPoint } from './viewport';

interface CanvasProps {
  tool: ToolType;
  color: string;
  items?: BoardItem[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onCommit?: (item: BoardItem) => void;
  onEditText?: (id: string) => void;
  onPresence?: (point: Point) => void;
  viewport?: Viewport;
  onViewport?: (viewport: Viewport) => void;
  readOnly?: boolean;
  boardId?: string;
}

interface Interaction {
  pointerId: number;
  start: Point;
  item: BoardItem;
  original: BoardItem | null;
  resize?: boolean;
}

const cursorSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25">' +
  '<path d="M12 2v7m0 7v7M2 12h7m7 0h7" stroke="white" stroke-width="4"/>' +
  '<path d="M12 2v7m0 7v7M2 12h7m7 0h7" stroke="#0f172a" stroke-width="2"/>' +
  '<circle cx="12" cy="12" r="2" fill="#0f172a" stroke="white"/></svg>';
const drawingCursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 12 12, crosshair`;

const defaultViewport = { x: 0, y: 0, scale: 1 };
function cursorFor(tool: ToolType, draft: BoardItem | null, hoveredId: string | null) {
  if (tool === 'pan') return 'grab';
  if (tool !== 'select') return drawingCursor;
  if (draft) return 'grabbing';
  return hoveredId ? 'grab' : 'default';
}
export const Canvas: React.FC<CanvasProps> = ({
  tool,
  color,
  items: storedItems,
  selectedId: externalSelected,
  onSelect,
  onCommit,
  onEditText,
  onPresence,
  viewport = defaultViewport,
  onViewport,
  readOnly = false,
  boardId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pan = useRef<{ pointerId: number; start: Point; viewport: Viewport } | null>(null);
  const space = useRef(false);
  const visibleItems = storedItems ?? items;
  const selected = externalSelected === undefined ? selectedId : externalSelected;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey) {
        const scale = Math.min(4, Math.max(0.1, viewport.scale * Math.exp(-event.deltaY * 0.01)));
        const world = worldPoint(point, viewport);
        onViewport?.({ x: point.x - world.x * scale, y: point.y - world.y * scale, scale });
      } else onViewport?.({ ...viewport, x: viewport.x - event.deltaX, y: viewport.y - event.deltaY });
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [viewport, onViewport]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (event.target instanceof HTMLElement && event.target.matches('input,textarea,select')) return;
      if (document.querySelector('dialog[open]')) return;
      space.current = true;
      event.preventDefault();
    };
    const up = () => {
      space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', up);
    };
  }, []);
  function select(id: string | null) {
    setSelectedId(id);
    onSelect?.(id);
  }
  useCanvasRenderer(canvasRef, visibleItems, draft, tool === 'select' ? selected : null, viewport, boardId);

  const getPoint = (event: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return worldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewport);
  };

  const beginPan = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan' || space.current || event.button === 1) {
      pan.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return true;
    }
    return false;
  };
  const isResize = (original: BoardItem | null, start: Point) => {
    if (!original || original.id !== selected) return false;
    return (
      Math.hypot(start.x - original.x - original.width, start.y - original.y - original.height) < 14 / viewport.scale
    );
  };
  const beginDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = getPoint(event);
    const original = tool === 'select' ? (findItemAt(visibleItems, start) ?? null) : null;
    select(original?.id ?? null);
    if (readOnly || tool === 'image' || tool === 'pan') return;
    const item = tool === 'select' ? original : createDraft(tool, color, start);
    if (!item) return;
    const resize = isResize(original, start);
    interaction.current = { pointerId: event.pointerId, start, item, original, resize };
    setDraft(item);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    event.preventDefault();
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || interaction.current || pan.current) return;
    if (beginPan(event)) return;
    if (event.button === 0) beginDrawing(event);
  };

  const updateInteraction = (active: Interaction, point: Point) => {
    if (active.resize && active.original) {
      active.item = resizeItem(active.original, point);
      return active.item;
    }
    active.item = active.original
      ? moveItem(active.original, { x: point.x - active.start.x, y: point.y - active.start.y })
      : updateDraft(active.item, active.start, point);
    return active.item;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = interaction.current;
    const point = getPoint(event);
    onPresence?.(point);
    const panning = pan.current;
    if (panning && panning.pointerId === event.pointerId) {
      onViewport?.({
        ...panning.viewport,
        x: panning.viewport.x + event.clientX - panning.start.x,
        y: panning.viewport.y + event.clientY - panning.start.y,
      });
      return;
    }
    if (!active) {
      if (tool === 'select') setHoveredId(findItemAt(visibleItems, point)?.id ?? null);
      return;
    }
    if (event.pointerId !== active.pointerId) return;
    setDraft(updateInteraction(active, point));
  };

  const clearInteraction = () => {
    interaction.current = null;
    setDraft(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current?.pointerId === event.pointerId) {
      pan.current = null;
      return;
    }
    const active = interaction.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const item = finishDraft(updateInteraction(active, getPoint(event)));
    onCommit?.(item);
    setItems((previous) =>
      active.original ? previous.map((existing) => (existing.id === item.id ? item : existing)) : [...previous, item],
    );
    select(item.id);
    clearInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current?.pointerId === event.pointerId) pan.current = null;
    if (event.pointerId === interaction.current?.pointerId) clearInteraction();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.code === 'Space') {
      space.current = true;
      event.preventDefault();
    }
    if (event.key !== 'Escape') return;
    const pointerId = interaction.current?.pointerId;
    clearInteraction();
    select(null);
    pan.current = null;
    if (pointerId !== undefined && event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label={t('board.canvasLabel')}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handleCancel}
      onLostPointerCapture={handleCancel}
      onPointerLeave={() => setHoveredId(null)}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => {
        if (event.code === 'Space') space.current = false;
      }}
      onBlur={() => {
        space.current = false;
      }}
      onDoubleClick={(event) => {
        const item = findItemAt(visibleItems, getPoint(event));
        if (item && !readOnly) {
          select(item.id);
          onEditText?.(item.id);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        touchAction: 'none',
        cursor: cursorFor(tool, draft, hoveredId),
      }}
    />
  );
};
