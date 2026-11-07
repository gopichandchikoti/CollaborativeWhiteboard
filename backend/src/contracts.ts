import { z } from 'zod';

export const roleSchema = z.enum(['editor', 'commenter', 'viewer']);
export type Role = z.infer<typeof roleSchema> | 'owner';
export const idSchema = z.uuid();
export const titleSchema = z.string().trim().min(1).max(100);
export const accountSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(60).optional(),
});
// Keep existing 12-character credentials usable at login; new single-factor enrollment requires 15 code points.
export const registrationSchema = accountSchema.extend({
  password: z
    .string()
    .max(128)
    .refine((value) => [...value].length >= 15),
});
const coordinate = z.number().finite().min(-1000000).max(1000000);
const point = z.object({ x: coordinate, y: coordinate }).strict();
export const itemSchema = z
  .object({
    id: idSchema,
    type: z.enum(['rectangle', 'circle', 'sticky', 'arrow', 'pen', 'text', 'frame', 'image']),
    x: coordinate,
    y: coordinate,
    width: z.number().finite().min(0).max(100000),
    height: z.number().finite().min(0).max(100000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fillColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    text: z.string().max(4000).optional(),
    points: z.array(point).max(4000).optional(),
    assetId: idSchema.optional(),
    zIndex: z.number().finite().min(-1000000).max(1000000).optional(),
  })
  .strict();
export type BoardItem = z.infer<typeof itemSchema>;
export interface User {
  id: string;
  email: string;
  name: string;
}
export interface Board {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  ownerId: string;
  role: Role;
}
export interface Workspace {
  id: string;
  title: string;
  ownerId: string;
}
export interface Comment {
  id: string;
  boardId: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
  resolved: number;
}
export function editable(role: Role) {
  return role === 'owner' || role === 'editor';
}
