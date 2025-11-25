export class ServiceError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.details = details;
  }
}

export function assertCondition(condition: boolean, message: string, status = 400) {
  if (!condition) {
    throw new ServiceError(message, status);
  }
}
