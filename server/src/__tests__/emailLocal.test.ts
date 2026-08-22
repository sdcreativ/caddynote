import { afterEach, describe, expect, it } from 'vitest';
import {
  isEmailConfigured,
  isLocalSmtpRelay,
  resetEmailTransporter,
} from '../lib/email.js';

describe('email / Mailpit local', () => {
  const keys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'SMTP_NO_AUTH',
    'CADDYNOTE_TEST_MODE',
  ] as const;
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    resetEmailTransporter();
  });

  const snapshot = () => {
    for (const k of keys) prev[k] = process.env[k];
  };

  it('détecte un relais Mailpit / localhost', () => {
    snapshot();
    process.env.SMTP_HOST = 'mailpit';
    expect(isLocalSmtpRelay()).toBe(true);
    process.env.SMTP_HOST = 'smtp.sendgrid.net';
    expect(isLocalSmtpRelay()).toBe(false);
  });

  it('accepte SMTP_NO_AUTH sans USER/PASS', () => {
    snapshot();
    process.env.SMTP_HOST = 'mailpit';
    process.env.SMTP_FROM = 'CaddyNote <noreply@caddynote.local>';
    process.env.SMTP_NO_AUTH = 'true';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(isEmailConfigured()).toBe(true);
  });

  it('autorise Mailpit même en CADDYNOTE_TEST_MODE', () => {
    snapshot();
    process.env.CADDYNOTE_TEST_MODE = 'true';
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'noreply@caddynote.local';
    process.env.SMTP_NO_AUTH = 'true';
    expect(isEmailConfigured()).toBe(true);
  });

  it('refuse un SMTP distant en TEST_MODE', () => {
    snapshot();
    process.env.CADDYNOTE_TEST_MODE = 'true';
    process.env.SMTP_HOST = 'smtp.exemple.ci';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    process.env.SMTP_FROM = 'noreply@exemple.ci';
    delete process.env.SMTP_NO_AUTH;
    expect(isEmailConfigured()).toBe(false);
  });
});
