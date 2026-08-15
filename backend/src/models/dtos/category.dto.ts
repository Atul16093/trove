import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex value like #0A84FF');

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(120),
  color: HexColor.optional(),
});
export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;

/** Rename and/or recolor. The slug is never editable — the categorizer maps into it. */
export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: HexColor.optional(),
}).refine((d) => d.name !== undefined || d.color !== undefined, {
  message: 'Provide a name or a color to update',
});
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

/** The full ordered list of the caller's category uuids, first to last. */
export const ReorderCategoriesSchema = z.object({
  uuids: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderCategoriesDto = z.infer<typeof ReorderCategoriesSchema>;
