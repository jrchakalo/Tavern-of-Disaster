import { z } from 'zod';

// Central hub for REST and Socket.IO validation schemas.
// TODO: Replace placeholder schemas with real definitions in future steps.
export const zLoginRequest = z.any();
export const zMoveTokenPayload = z.any();
export const zRollDicePayload = z.any();

export const schemas = {
  zLoginRequest,
  zMoveTokenPayload,
  zRollDicePayload,
};
