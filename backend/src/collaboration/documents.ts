import * as Y from 'yjs';
import { BadRequestException } from '@nestjs/common';
import { itemSchema } from '../contracts';
import { Boards } from '../boards';

export function decodeUpdate(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > 2800000) throw new BadRequestException('invalidUpdate');
  return new Uint8Array(Buffer.from(value, 'base64'));
}
export function encodeUpdate(update: Uint8Array) {
  return Buffer.from(update).toString('base64');
}
export function validateDocument(doc: Y.Doc, boardId: string, boards: Boards) {
  if (doc.share.size > 1 || [...doc.share.keys()].some((key) => key !== 'items')) {
    throw new BadRequestException('invalidUpdate');
  }
  const items = doc.getMap('items');
  if (items.size > 5000) throw new BadRequestException('limitReached');
  for (const [key, value] of items) {
    validateItem({ key, value, boardId, boards });
  }
  if (Y.encodeStateAsUpdate(doc).byteLength > 2000000) throw new BadRequestException('limitReached');
}
function validateItem({
  key,
  value,
  boardId,
  boards,
}: {
  key: string;
  value: unknown;
  boardId: string;
  boards: Boards;
}) {
  const result = itemSchema.safeParse(value);
  if (!result.success || key !== result.data.id) throw new BadRequestException('invalidUpdate');
  if (result.data.type === 'image' && !result.data.assetId) throw new BadRequestException('invalidUpdate');
  if (
    result.data.assetId &&
    !boards.store.get('SELECT id FROM assets WHERE id=? AND boardId=?', result.data.assetId, boardId)
  )
    throw new BadRequestException('invalidAsset');
}
export function applyValidated(doc: Y.Doc, update: Uint8Array, boardId: string, boards: Boards) {
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(candidate, update);
    validateDocument(candidate, boardId, boards);
    const snapshot = Y.encodeStateAsUpdate(candidate);
    boards.save(boardId, snapshot);
    Y.applyUpdate(doc, update);
    return snapshot;
  } finally {
    candidate.destroy();
  }
}
