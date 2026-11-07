import { RefObject, useEffect, useLayoutEffect, useState } from 'react';
import { BoardItem, Viewport } from '../../types/board';
import { drawScene } from './rendering';
import { visibleInViewport } from './viewport';
import { imageFor, loadBoardImages } from './images';

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  items: BoardItem[],
  draft: BoardItem | null,
  selectedId: string | null,
  viewport: Viewport = { x: 0, y: 0, scale: 1 },
  boardId?: string,
) {
  const [resizeVersion, setResizeVersion] = useState(0);
  useEffect(() => {
    if (!boardId) return;
    let active = true;
    loadBoardImages(boardId, items)
      .then(() => {
        if (active) setResizeVersion((value) => value + 1);
      })
      .catch(() => {
        if (active) setResizeVersion((value) => value + 1);
      });
    return () => {
      active = false;
    };
  }, [boardId, items]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => setResizeVersion((version) => version + 1);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);
    const visible = items.filter((item) => visibleInViewport(item, viewport, rect.width, rect.height));
    drawScene(ctx, visible, draft, selectedId, (assetId) => imageFor(boardId, assetId));
  }, [canvasRef, items, draft, selectedId, resizeVersion, viewport, boardId]);
}
