import 'fake-indexeddb/auto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Canvas as NativeCanvas, createCanvas } from '@napi-rs/canvas';
import { clearDrafts } from '../src/lib/offline';

export class UISocket {
  static OPEN = 1;
  static role = 'owner';
  static instances: UISocket[] = [];
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  constructor() {
    UISocket.instances.push(this);
    queueMicrotask(() => this.receive({ type: 'sync', data: 'AAA=', role: UISocket.role, generation: 0 }));
  }
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  send(value: string) {
    const message = JSON.parse(value) as Record<string, unknown>;
    this.sent.push(message);
    if (message.type === 'update') queueMicrotask(() => this.receive({ type: 'ack', id: message.id }));
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
beforeEach(async () => {
  await clearDrafts('owner:');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', UISocket);
  UISocket.role = 'owner';
  UISocket.instances = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1200,
    height: 800,
    right: 1200,
    bottom: 800,
    toJSON() {},
  });
  const surfaces = new WeakMap<HTMLCanvasElement, NativeCanvas>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    let surface = surfaces.get(this);
    if (!surface || surface.width !== this.width || surface.height !== this.height) {
      surface = createCanvas(Math.max(1, this.width), Math.max(1, this.height));
      surfaces.set(this, surface);
    }
    return surface.getContext('2d') as unknown as CanvasRenderingContext2D;
  });
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  window.history.replaceState({}, '', '/');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
