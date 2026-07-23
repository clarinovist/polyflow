import { describe, expect, it } from 'vitest';
import { resolveOutcome, VirtualCsAuditInput } from './chat-audit';

function makeInput(overrides: Partial<VirtualCsAuditInput> = {}): VirtualCsAuditInput {
  return {
    channel: 'web',
    product: 'polyflow',
    question: 'test question',
    allowed: true,
    success: true,
    latencyMs: 100,
    ...overrides,
  };
}

describe('resolveOutcome', () => {
  it('returns FAILED when success is false', () => {
    expect(resolveOutcome(makeInput({ success: false }))).toBe('FAILED');
  });

  it('returns BLOCKED when allowed is false', () => {
    expect(resolveOutcome(makeInput({ allowed: false }))).toBe('BLOCKED');
  });

  it('returns FAILED when answer is empty', () => {
    expect(resolveOutcome(makeInput({ answer: '' }))).toBe('FAILED');
  });

  it('returns FAILED when answer is very short', () => {
    expect(resolveOutcome(makeInput({ answer: 'ok' }))).toBe('FAILED');
  });

  it('returns FAILED when answer is generic failure pattern', () => {
    expect(resolveOutcome(makeInput({ answer: 'Maaf, saya tidak dapat merangkum analisis pada saat ini.' }))).toBe('FAILED');
  });

  it('returns FAILED when answer is network error', () => {
    expect(resolveOutcome(makeInput({ answer: 'Maaf, saya sedang mengalami gangguan koneksi (Network Error).' }))).toBe('FAILED');
  });

  it('returns PARTIAL when answer is weak / "tidak tahu"', () => {
    expect(resolveOutcome(makeInput({ answer: 'Maaf, saya tidak tahu informasi tersebut.' }))).toBe('PARTIAL');
  });

  it('returns PARTIAL when answer says "tidak yakin"', () => {
    expect(resolveOutcome(makeInput({ answer: 'Saya tidak yakin dengan informasi ini, silakan cek langsung.' }))).toBe('PARTIAL');
  });

  it('returns PARTIAL when answer says "tidak memiliki informasi"', () => {
    expect(resolveOutcome(makeInput({ answer: 'Saya tidak memiliki informasi tentang hal tersebut saat ini.' }))).toBe('PARTIAL');
  });

  it('returns SUCCESS for a good substantive answer', () => {
    expect(resolveOutcome(makeInput({
      answer: 'Untuk membuat Sales Order, buka menu Sales → Sales Order, klik tombol + Baru, pilih Customer, tambahkan item produk, lalu klik Simpan.',
    }))).toBe('SUCCESS');
  });

  it('returns SUCCESS for a data-based answer', () => {
    expect(resolveOutcome(makeInput({
      answer: 'Stok MP 15 di Gudang A: 150.00 KG. Stok cukup untuk memenuhi pesanan.',
    }))).toBe('SUCCESS');
  });
});
