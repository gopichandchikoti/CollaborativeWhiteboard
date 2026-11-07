import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('invalidInput');
  return result.data;
}
