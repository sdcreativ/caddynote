import { describe, it, expect } from 'vitest';
import type { JwtPayload } from './jwt.js';
import {
  canReadSetting,
  canWriteSetting,
  extractInstitutionIdFromSettingKey,
  redactSettingValue,
} from './settingAccess.js';

const INST_A = '11111111-1111-4111-8111-111111111111';
const INST_B = '22222222-2222-4222-8222-222222222222';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const auth = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: USER,
  role: 'teacher',
  institutionId: INST_A,
  sid: 'sid-test',
  ...overrides,
});

describe('extractInstitutionIdFromSettingKey', () => {
  it('extrait l’UUID des clés sso / admissions / onboarding', () => {
    expect(extractInstitutionIdFromSettingKey(`sso:${INST_A}`)).toBe(INST_A);
    expect(extractInstitutionIdFromSettingKey(`admissions:${INST_A}`)).toBe(INST_A);
    expect(extractInstitutionIdFromSettingKey(`onboarding:${INST_A}`)).toBe(INST_A);
  });

  it('ignore une clé sans UUID', () => {
    expect(extractInstitutionIdFromSettingKey('sso:not-an-id')).toBeNull();
  });
});

describe('canReadSetting', () => {
  it('refuse sso_pending et sso_adopt même à l’admin', () => {
    const admin = auth({ role: 'admin', institutionId: null });
    expect(
      canReadSetting(admin, {
        category: 'sso_pending',
        key: 'state-1',
        isPublic: false,
      })
    ).toBe(false);
    expect(
      canReadSetting(admin, {
        category: 'sso_adopt',
        key: 'code-hash',
        isPublic: true,
      })
    ).toBe(false);
  });

  it('autorise l’admin sur system / institution', () => {
    const admin = auth({ role: 'admin', institutionId: null });
    expect(canReadSetting(admin, { category: 'system', key: 'platformFlags', isPublic: false })).toBe(true);
    expect(canReadSetting(admin, { category: 'institution', key: `sso:${INST_B}`, isPublic: false })).toBe(true);
  });

  it('refuse à un enseignant le dump system sensible et le SSO', () => {
    const teacher = auth({ role: 'teacher' });
    expect(canReadSetting(teacher, { category: 'system', key: 'platformFlags', isPublic: false })).toBe(false);
    expect(canReadSetting(teacher, { category: 'institution', key: `sso:${INST_A}`, isPublic: false })).toBe(false);
    expect(canReadSetting(teacher, { category: 'system', key: 'maintenanceMode', isPublic: false })).toBe(false);
  });

  it('autorise la direction sur les clés system non secrètes de son école', () => {
    const director = auth({ role: 'school_admin' });
    expect(canReadSetting(director, { category: 'system', key: 'maintenanceMode', isPublic: false })).toBe(true);
    expect(canReadSetting(director, { category: 'system', key: 'commsKillSwitch', isPublic: false })).toBe(false);
    expect(canReadSetting(director, { category: 'institution', key: `sso:${INST_A}`, isPublic: false })).toBe(true);
    expect(canReadSetting(director, { category: 'institution', key: `sso:${INST_B}`, isPublic: false })).toBe(false);
  });

  it('isPublic n’ouvre que l’allowlist — jamais le SSO d’un tenant', () => {
    const teacher = auth({ role: 'teacher' });
    expect(
      canReadSetting(teacher, { category: 'institution', key: `sso:${INST_B}`, isPublic: true })
    ).toBe(false);
    expect(
      canReadSetting(teacher, { category: 'system', key: 'platformFlags', isPublic: true })
    ).toBe(false);
    expect(
      canReadSetting(teacher, { category: 'platform', key: 'announcement', isPublic: true })
    ).toBe(true);
    expect(
      canReadSetting(teacher, { category: 'system', key: 'publicStatusSnapshot', isPublic: true })
    ).toBe(true);
    expect(
      canReadSetting(teacher, { category: 'platform', key: 'announcement', isPublic: false })
    ).toBe(false);
  });

  it('autorise uniquement les clés préfixées par l’utilisateur', () => {
    const teacher = auth({ role: 'teacher' });
    expect(canReadSetting(teacher, { category: 'notifications', key: `${USER}:emailEnabled`, isPublic: false })).toBe(
      true
    );
    expect(
      canReadSetting(teacher, {
        category: 'notifications',
        key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:emailEnabled',
        isPublic: false,
      })
    ).toBe(false);
  });
});

describe('canWriteSetting', () => {
  it('refuse à la direction le SSO d’un autre établissement', () => {
    const director = auth({ role: 'school_admin' });
    expect(canWriteSetting(director, 'institution', `sso:${INST_A}`)).toBe(true);
    expect(canWriteSetting(director, 'institution', `sso:${INST_B}`)).toBe(false);
    expect(canWriteSetting(director, 'institution', 'sso:not-an-id')).toBe(false);
  });

  it('refuse system / platform / pending hors admin', () => {
    const director = auth({ role: 'school_admin' });
    expect(canWriteSetting(director, 'system', 'platformFlags')).toBe(false);
    expect(canWriteSetting(director, 'platform', 'announcement')).toBe(false);
    expect(canWriteSetting(director, 'sso_pending', 'state-1')).toBe(false);
    expect(canWriteSetting(auth({ role: 'admin', institutionId: null }), 'sso_pending', 'state-1')).toBe(false);
    expect(canWriteSetting(auth({ role: 'admin', institutionId: null }), 'sso_adopt', 'code-hash')).toBe(false);
  });

  it('autorise l’admin sur les flags plateforme', () => {
    expect(canWriteSetting(auth({ role: 'admin', institutionId: null }), 'system', 'platformFlags')).toBe(true);
  });

  it('autorise uniquement les clés utilisateur notifications / attendance', () => {
    const teacher = auth({ role: 'teacher' });
    expect(canWriteSetting(teacher, 'attendance', `${USER}:autoMarkAbsent`)).toBe(true);
    expect(canWriteSetting(teacher, 'institution', `sso:${INST_A}`)).toBe(false);
    expect(canWriteSetting(teacher, 'system', `${USER}:appName`)).toBe(false);
  });
});

describe('redactSettingValue', () => {
  it('masque clientSecret SSO', () => {
    const redacted = redactSettingValue('institution', `sso:${INST_A}`, {
      enabled: true,
      provider: 'azure_ad',
      clientId: 'abc',
      clientSecret: 'super-secret-value',
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('super-secret-value');
    expect(redacted).toMatchObject({ clientSecret: '********', hasClientSecret: true, clientId: 'abc' });
  });

  it('masque les champs secrets imbriqués', () => {
    const redacted = redactSettingValue('system', 'smtp', {
      host: 'mail.example',
      smtpPass: 'p@ss',
      nested: { apiKey: 'AKIAXXXX' },
    }) as Record<string, unknown>;
    expect(redacted.smtpPass).toBe('********');
    expect((redacted.nested as { apiKey: string }).apiKey).toBe('********');
    expect(redacted.host).toBe('mail.example');
  });
});
