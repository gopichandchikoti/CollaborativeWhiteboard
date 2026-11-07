interface CachedBoard {
  key: string;
  data: Uint8Array;
  generation: number | null;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('whiteboard-private-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('boards', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDraft(key: string): Promise<CachedBoard | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('boards').objectStore('boards').get(key);
      request.onsuccess = () => resolve(request.result as CachedBoard | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDraft(value: CachedBoard) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('boards', 'readwrite');
      transaction.objectStore('boards').put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function clearDrafts(prefix: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('boards', 'readwrite');
      const store = transaction.objectStore('boards');
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (String(current.key).startsWith(prefix)) current.delete();
        current.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
