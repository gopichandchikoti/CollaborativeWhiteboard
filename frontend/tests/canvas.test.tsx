import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Canvas as NativeCanvas, createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../src/components/Toolbar/Toolbar';
import { Canvas } from '../src/components/Canvas/Canvas';
import { ToolType } from '../src/types/board';

let root: Root;
let container: HTMLDivElement;
let canvas: HTMLCanvasElement;
let surfaces: WeakMap<HTMLCanvasElement, NativeCanvas>;
let captured: Set<number>;
let viewport: { width: number; height: number; left: number; top: number };

function renderCanvas(tool: ToolType = 'rectangle', color = '#ef4444') {
  act(() => root.render(<Canvas tool={tool} color={color} />));
  canvas = container.querySelector('canvas')!;
}

function pointer(type: string, x: number, y: number, extra: Partial<PointerEventInit> = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: extra.button ?? 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: extra.pointerId ?? 1 },
    isPrimary: { value: extra.isPrimary ?? true },
    pointerType: { value: extra.pointerType ?? 'mouse' },
  });
  act(() => {
    canvas.dispatchEvent(event);
  });
}

function pixel(x: number, y: number) {
  return Array.from(surfaces.get(canvas)!.getContext('2d').getImageData(x, y, 1, 1).data);
}

function expectRed(x: number, y: number) {
  const [red, green, blue, alpha] = pixel(x, y);
  expect(red).toBeGreaterThan(220);
  expect(green).toBeLessThan(100);
  expect(blue).toBeLessThan(100);
  expect(alpha).toBeGreaterThan(0);
}

function drawRectangle() {
  pointer('pointerdown', 100, 100);
  pointer('pointermove', 300, 250);
  pointer('pointerup', 300, 250);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  surfaces = new WeakMap();
  captured = new Set();
  viewport = { width: 1000, height: 700, left: 0, top: 0 };
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    ...viewport,
    x: viewport.left,
    y: viewport.top,
    right: viewport.left + viewport.width,
    bottom: viewport.top + viewport.height,
    toJSON() {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let surface = surfaces.get(this);
    if (!surface) {
      surface = createCanvas(this.width, this.height);
      surfaces.set(this, surface);
    }
    if (surface.width !== this.width) surface.width = this.width;
    if (surface.height !== this.height) surface.height = this.height;
    return surface.getContext('2d') as unknown as CanvasRenderingContext2D;
  });
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn((id) => captured.has(id));
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('drawing feedback before release', () => {
  it.each(['rectangle', 'sticky'] as const)('shows a %s while dragging and preserves it on release', (tool) => {
    renderCanvas(tool);
    expect(pixel(100, 150)[3]).toBe(0);
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 250);
    expectRed(100, 150);
    expectRed(200, 250);
    expect(captured.has(1)).toBe(true);
    pointer('pointerup', 300, 250);
    expectRed(100, 150);
    expect(captured.has(1)).toBe(false);
  });

  it('shows an ellipse before release when dragging upwards and leftwards', () => {
    renderCanvas('circle');
    pointer('pointerdown', 600, 300);
    pointer('pointermove', 400, 100);
    expectRed(599, 200);
    expect(pixel(400, 100)[3]).toBe(0);
    pointer('pointerup', 400, 100);
    expectRed(599, 200);
  });

  it('draws a continuous freehand path immediately in the selected color', () => {
    renderCanvas('pen');
    pointer('pointerdown', 100, 100, { pointerType: 'pen' });
    expectRed(100, 100);
    pointer('pointermove', 120, 160);
    expectRed(110, 130);
    pointer('pointermove', 180, 180);
    expectRed(150, 170);
    pointer('pointerup', 200, 160);
    expectRed(190, 170);
    expectRed(110, 130);
  });

  it('preserves a pencil dot when clicking without dragging', () => {
    renderCanvas('pen');
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 100, 100);
    expectRed(100, 100);
  });

  it('draws a directional arrow and its head during a reverse drag', () => {
    renderCanvas('arrow');
    pointer('pointerdown', 300, 200);
    pointer('pointermove', 100, 200);
    expectRed(200, 200);
    expect(pixel(108, 204)[3]).toBeGreaterThan(0);
    pointer('pointerup', 100, 200);
    expectRed(200, 200);
  });

  it('keeps thin drags thin instead of inventing a default height', () => {
    renderCanvas();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 100);
    pointer('pointerup', 300, 100);
    expectRed(200, 100);
    expect(pixel(100, 150)[3]).toBe(0);
  });

  it('keeps the cursor visible independently of the paint color', () => {
    renderCanvas('pen', '#ffffff');
    expect(canvas.style.cursor).toContain('data:image/svg+xml');
    expect(decodeURIComponent(canvas.style.cursor)).toContain('stroke="white"');
    expect(decodeURIComponent(canvas.style.cursor)).toContain('#0f172a');
    expect(canvas.style.touchAction).toBe('none');
  });
});

describe('selection and gesture recovery', () => {
  it('selects and moves an existing object with live feedback and no ghost copy', () => {
    renderCanvas();
    drawRectangle();
    renderCanvas('select');
    pointer('pointermove', 150, 150);
    expect(canvas.style.cursor).toBe('grab');
    pointer('pointerdown', 150, 150);
    expect(pixel(94, 150)[3]).toBeGreaterThan(0);
    pointer('pointermove', 350, 250);
    expect(canvas.style.cursor).toBe('grabbing');
    expect(pixel(100, 150)[3]).toBe(0);
    expectRed(300, 250);
    pointer('pointerup', 350, 250);
    expectRed(300, 250);
    expect(pixel(100, 150)[3]).toBe(0);
  });

  it('does not draw an invisible select item on empty canvas', () => {
    renderCanvas('select');
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 250);
    pointer('pointerup', 300, 250);
    expect(captured.size).toBe(0);
    expect(pixel(100, 150)[3]).toBe(0);
    expect(canvas.style.cursor).toBe('default');
  });

  it.each(['pointercancel', 'lostpointercapture'])('restores a moving object after %s', (type) => {
    renderCanvas();
    drawRectangle();
    renderCanvas('select');
    pointer('pointerdown', 150, 150);
    pointer('pointermove', 350, 250);
    pointer(type, 350, 250);
    pointer('pointerup', 350, 250);
    expectRed(100, 150);
    expect(pixel(500, 300)[3]).toBe(0);
  });

  it('Escape discards an unfinished shape and releases capture', () => {
    renderCanvas();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 250);
    act(() => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    pointer('pointerup', 300, 250);
    expect(pixel(100, 150)[3]).toBe(0);
    expect(captured.size).toBe(0);
  });

  it('ignores right clicks and unrelated pointers during an active gesture', () => {
    renderCanvas();
    pointer('pointerdown', 100, 100, { button: 2 });
    expect(captured.size).toBe(0);
    pointer('pointerdown', 100, 100, { isPrimary: false });
    expect(captured.size).toBe(0);
    pointer('pointerdown', 100, 100);
    pointer('pointerdown', 500, 500, { pointerId: 2 });
    pointer('pointermove', 800, 600, { pointerId: 2 });
    pointer('pointerup', 800, 600, { pointerId: 2 });
    pointer('pointercancel', 800, 600, { pointerId: 2 });
    pointer('pointermove', 300, 250);
    expectRed(100, 150);
    expect(pixel(800, 500)[3]).toBe(0);
    pointer('pointerup', 300, 250);
    expectRed(100, 150);
  });

  it('finishes a captured drag outside the canvas without leaving a stuck draft', () => {
    renderCanvas();
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 1100, 800);
    pointer('pointerup', 1100, 800);
    expectRed(100, 400);
    expect(captured.size).toBe(0);
    pointer('pointermove', 300, 250);
    expectRed(100, 400);
  });
});

describe('canvas sizing and toolbar integration', () => {
  it('edits controlled objects, pans, zooms and resizes without mutating read-only boards', () => {
    const onCommit = vi.fn();
    const onViewport = vi.fn();
    const onSelect = vi.fn();
    const onEditText = vi.fn();
    const item = {
      id: 'controlled',
      type: 'rectangle' as const,
      color: '#ef4444',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    };
    const render = (tool: ToolType, readOnly = false) =>
      act(() =>
        root.render(
          <Canvas
            tool={tool}
            color="#ef4444"
            items={[item]}
            selectedId={item.id}
            onSelect={onSelect}
            onCommit={onCommit}
            onViewport={onViewport}
            onEditText={onEditText}
            readOnly={readOnly}
          />,
        ),
      );
    render('select');
    canvas = container.querySelector('canvas')!;
    pointer('pointerdown', 300, 250);
    pointer('pointermove', 400, 350);
    pointer('pointerup', 400, 350);
    expect(onCommit.mock.calls[0][0]).toMatchObject({ width: 300, height: 250 });
    act(() => canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 150, clientY: 150 })));
    expect(onEditText).toHaveBeenCalledWith(item.id);
    render('pan');
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 160, 150);
    pointer('pointerup', 160, 150);
    expect(onViewport).toHaveBeenCalledWith({ x: 60, y: 50, scale: 1 });
    pointer('pointerdown', 100, 100);
    pointer('pointercancel', 100, 100);
    act(() => canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 10 })));
    act(() =>
      canvas.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -20, ctrlKey: true, clientX: 200, clientY: 100 }),
      ),
    );
    expect(onViewport.mock.calls.at(-1)?.[0].scale).toBeGreaterThan(1);
    render('select', true);
    const count = onCommit.mock.calls.length;
    pointer('pointerdown', 150, 150);
    pointer('pointermove', 170, 170);
    pointer('pointerup', 170, 170);
    expect(onCommit).toHaveBeenCalledTimes(count);
    render('image');
    pointer('pointerdown', 150, 150);
    expect(onCommit).toHaveBeenCalledTimes(count);
    act(() => canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space' })));
    pointer('pointerdown', 150, 150);
    pointer('pointermove', 160, 160);
    pointer('pointerup', 160, 160);
    act(() => canvas.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Space' })));
    act(() => canvas.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    pointer('pointerdown', 150, 150, { button: 2 });
  });
  it('preserves content across resize at twice the display resolution', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    renderCanvas();
    drawRectangle();
    viewport.width = 600;
    viewport.height = 400;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(800);
    expectRed(200, 300);
  });

  it('converts pointer coordinates relative to the canvas instead of the window', () => {
    viewport.left = 40;
    viewport.top = 30;
    renderCanvas();
    pointer('pointerdown', 140, 130);
    pointer('pointermove', 340, 280);
    expectRed(100, 150);
  });

  it('uses the toolbar tool and color for the live drawing', () => {
    function Harness() {
      const [tool, setTool] = useState<ToolType>('select');
      const [color, setColor] = useState('#24332e');
      return (
        <>
          <Canvas tool={tool} color={color} />
          <Toolbar currentTool={tool} onSelectTool={setTool} currentColor={color} onSelectColor={setColor} />
        </>
      );
    }
    act(() => root.render(<Harness />));
    canvas = container.querySelector('canvas')!;
    const click = (label: string) => {
      act(() => {
        container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
      });
    };
    click('Rectangle');
    click('Color #be4c3c');
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 250);
    expect(pixel(100, 150)[0]).toBeGreaterThan(150);
    expect(container.querySelector('[aria-label="Rectangle"]')?.getAttribute('aria-pressed')).toBe('true');
    pointer('pointerup', 300, 250);
    click('Pen');
    pointer('pointerdown', 400, 100);
    pointer('pointermove', 500, 200);
    expect(pixel(450, 150)[0]).toBeGreaterThan(150);
  });
});
