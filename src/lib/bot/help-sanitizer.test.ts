import { describe, it, expect } from 'vitest';
import { sanitizeQuestion, containsSensitiveData } from './help-sanitizer';

describe('help-sanitizer', () => {
  it('strips SO numbers', () => {
    const out = sanitizeQuestion('Kenapa SO-2026-0001 gagal?');
    expect(out).not.toContain('SO-2026-0001');
    expect(out).toContain('[NOMOR-DOKUMEN]');
  });

  it('strips emails', () => {
    const out = sanitizeQuestion('Kirim ke budi@example.com');
    expect(out).not.toContain('budi@example.com');
  });

  it('keeps normal questions', () => {
    const out = sanitizeQuestion('Cara buat sales order?');
    expect(out).toContain('Cara buat sales order');
  });

  it('detects sensitive email', () => {
    expect(containsSensitiveData('ada email foo@bar.com di sini')).toBe(true);
  });

  it('no false positive for normal', () => {
    expect(containsSensitiveData('Cara buat sales order')).toBe(false);
  });
});
