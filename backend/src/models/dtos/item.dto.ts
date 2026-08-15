import { z } from 'zod';

export const CreateItemSchema = z.object({
  url: z.string().min(3),
  caption: z.string().max(8000).optional(),
  captureSource: z.enum(['telegram', 'web', 'mobile_share', 'extension']).optional(),
});
export type CreateItemDto = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = z.object({
  categoryUuid: z.string().uuid().optional(),
  title: z.string().max(512).optional(),
  note: z.string().max(8000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
});
export type UpdateItemDto = z.infer<typeof UpdateItemSchema>;
