import { describe, it, expect } from 'vitest';
import {
  buildCommunicationEmail,
  communicationBodyToHtml,
  sanitizeCommunicationSubject,
} from './communications.js';

describe('communications — HTML e-mail', () => {
  it('échappe le HTML du body (script, img)', () => {
    const html = communicationBodyToHtml('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<br/>');
  });

  it('retire CR/LF du sujet SMTP', () => {
    expect(sanitizeCommunicationSubject('Info\r\nBcc: evil@example.com')).toBe('Info Bcc: evil@example.com');
    expect(sanitizeCommunicationSubject('\n\n')).toBe('(sans objet)');
  });

  it('buildCommunicationEmail n’embarque pas le body brut dans html', () => {
    const { subject, html, text } = buildCommunicationEmail({
      subject: 'Réunion\nBcc: evil@x.test',
      body: 'Bonjour <script>alert(1)</script>\nÀ demain',
    });
    expect(subject).toBe('Réunion Bcc: evil@x.test');
    expect(subject).not.toMatch(/[\r\n]/);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<br/>');
    expect(text).toBe('Bonjour <script>alert(1)</script>\nÀ demain');
  });
});
