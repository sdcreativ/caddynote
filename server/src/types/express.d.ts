import type { JwtPayload } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export {};
