import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates a request body against a Zod schema (mirrors ZodValidationPipe usage). */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new BadRequestException(msg || 'Validation failed');
    }
    return result.data;
  }
}
