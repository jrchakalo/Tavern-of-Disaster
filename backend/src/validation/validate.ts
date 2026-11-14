import { ZodSchema } from 'zod';
import { ServiceError } from '../services/serviceErrors';

const DEFAULT_ERROR_MESSAGE = 'Payload inválido.';

export function validate<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || undefined,
      message: issue.message,
      code: issue.code,
    }));
    const topMessage = issues[0]?.message ? `${DEFAULT_ERROR_MESSAGE} ${issues[0].message}` : DEFAULT_ERROR_MESSAGE;
    throw new ServiceError(topMessage, 400, { issues });
  }
  return result.data;
}
