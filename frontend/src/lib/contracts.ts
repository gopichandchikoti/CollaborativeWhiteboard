import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'editor', 'commenter', 'viewer']);
export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const workspaceSchema = z.object({ id: z.string(), title: z.string(), ownerId: z.string() });
export const boardSchema = z.object({
  id: z.string(),
  title: z.string(),
  workspaceId: z.string(),
  ownerId: z.string(),
  updatedAt: z.string(),
  role: roleSchema,
});
export const memberSchema = userSchema.extend({ role: roleSchema });
export const commentSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  userId: z.string(),
  name: z.string(),
  text: z.string(),
  createdAt: z.string(),
  resolved: z.number(),
});
export const historySchema = z.object({ id: z.string(), title: z.string(), createdAt: z.string() });
export type User = z.infer<typeof userSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Role = z.infer<typeof roleSchema>;
export const canEdit = (role: Role) => role === 'owner' || role === 'editor';
