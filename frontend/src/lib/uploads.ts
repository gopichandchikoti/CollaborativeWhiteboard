import { z } from 'zod';
import { api, ApiError } from './api';

export async function uploadImage(boardId: string, file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4194304) {
    throw new ApiError('invalidImage', 400);
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192) throw new ApiError('invalidImage', 400);
    const scale = Math.min(1, 2048 / bitmap.width, 2048 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png').split(',')[1];
    const result = await api(`boards/${boardId}/assets`, z.object({ assetId: z.string() }), 'POST', { data });
    return { ...result, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
