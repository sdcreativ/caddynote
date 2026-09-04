import { vi } from 'vitest';
import * as email from '../lib/email.js';
import { extractResetTokenFromUrl } from '../lib/passwordReset.js';

export const withCapturedResetEmail = async <T>(fn: () => Promise<T>): Promise<{ result: T; rawToken: string | undefined }> => {
  let rawToken: string | undefined;
  const spy = vi.spyOn(email, 'sendEmail').mockImplementation(async (params) => {
    rawToken = extractResetTokenFromUrl(`${params.text ?? ''}\n${params.html ?? ''}`) ?? undefined;
    return true;
  });
  try {
    const result = await fn();
    return { result, rawToken };
  } finally {
    spy.mockRestore();
  }
};
