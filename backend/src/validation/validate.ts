import { ZodSchema } from 'zod';
import { ServiceError } from '../services/serviceErrors';

// Generic validation helper that will be wired with Zod safeParse soon.
export function validate<T>(schema: ZodSchema<T>, value: unknown): T {
  // TODO: Run schema.safeParse(value) and throw ServiceError on validation failure.
  return value as T;
}
