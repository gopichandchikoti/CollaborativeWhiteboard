import { BoardItem } from '../../types/board';
const images = new Map<string, HTMLImageElement>();
const loading = new Map<string, { promise: Promise<void>; image: HTMLImageElement; cancel: () => void }>();
export function imageFor(boardId: string | undefined, assetId: string) {
  return images.get(`${boardId}:${assetId}`);
}
export async function loadBoardImages(boardId: string, items: BoardItem[]) {
  await Promise.all(
    items
      .filter((item) => item.assetId)
      .map((item) => {
        const key = `${boardId}:${item.assetId}`;
        if (images.has(key)) return Promise.resolve();
        const existing = loading.get(key);
        if (existing) return existing.promise;
        const image = new Image();
        let cancel = () => {};
        const promise = new Promise<void>((resolve, reject) => {
          cancel = resolve;
          image.onload = () => {
            if (loading.get(key)?.image !== image) return;
            loading.delete(key);
            images.set(key, image);
            resolve();
          };
          image.onerror = () => {
            if (loading.get(key)?.image !== image) return;
            loading.delete(key);
            reject(new Error('invalidAsset'));
          };
        });
        loading.set(key, { promise, image, cancel });
        image.src = `/api/boards/${encodeURIComponent(boardId)}/assets/${encodeURIComponent(item.assetId ?? '')}`;
        return promise;
      }),
  );
}
export function clearImages(boardId: string) {
  for (const key of images.keys()) if (key.startsWith(`${boardId}:`)) images.delete(key);
  for (const [key, entry] of loading) {
    if (!key.startsWith(`${boardId}:`)) continue;
    loading.delete(key);
    entry.image.onload = null;
    entry.image.onerror = null;
    entry.image.removeAttribute('src');
    entry.cancel();
  }
}
