import { z } from "zod";

export const PaginationParams = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationParams = z.infer<typeof PaginationParams>;

export const PaginatedResponse = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  });

export const ApiResponse = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: z.string().nullable(),
  });

export const ApiError = z.object({
  success: z.literal(false),
  data: z.null(),
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
