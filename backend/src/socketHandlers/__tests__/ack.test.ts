import { z } from 'zod';
import { extractAck, toAckError, toErrorCode } from '../ack';
import { ServiceError } from '../../services/serviceErrors';

describe('ack helpers', () => {
  it('mapeia status HTTP de ServiceError para ErrorCode', () => {
    expect(toErrorCode(new ServiceError('x', 400))).toBe('VALIDATION');
    expect(toErrorCode(new ServiceError('x', 401))).toBe('UNAUTHENTICATED');
    expect(toErrorCode(new ServiceError('x', 403))).toBe('FORBIDDEN');
    expect(toErrorCode(new ServiceError('x', 404))).toBe('NOT_FOUND');
    expect(toErrorCode(new ServiceError('x', 409))).toBe('CONFLICT');
    expect(toErrorCode(new ServiceError('x', 429))).toBe('RATE_LIMITED');
    expect(toErrorCode(new ServiceError('x', 500))).toBe('INTERNAL');
  });

  it('mapeia ZodError para VALIDATION com issues seguras', () => {
    const schema = z.object({ tableId: z.string().min(1) });
    const result = schema.safeParse({ tableId: '' });
    expect(result.success).toBe(false);
    const error = toAckError((result as any).error);
    expect(error.code).toBe('VALIDATION');
    expect(error.message.startsWith('Payload inválido.')).toBe(true);
    expect(error.details).toBeTruthy();
  });

  it('não vaza stack trace em erro desconhecido', () => {
    const error = toAckError(new Error('segredo interno'));
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('Erro interno do servidor.');
    expect(JSON.stringify(error)).not.toContain('segredo interno');
  });

  it('extractAck só aceita função', () => {
    const ack = jest.fn();
    expect(extractAck(ack)).toBe(ack);
    expect(extractAck({})).toBeUndefined();
    expect(extractAck(undefined)).toBeUndefined();
  });
});
