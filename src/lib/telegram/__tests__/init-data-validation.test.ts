import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTelegramInitData, createInitDataForTest } from '../init-data-validation';

const BOT_TOKEN = 'test_bot_token_12345';

describe('validateTelegramInitData', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('validates correct initData', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 10);
    const payload: Record<string, string> = {
      user: JSON.stringify({ id: 123, first_name: 'Budi', username: 'budi' }),
      auth_date: authDate,
      query_id: 'test_query',
    };
    const initData = createInitDataForTest(payload, BOT_TOKEN);
    const res = validateTelegramInitData(initData, BOT_TOKEN);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.data.user?.id).toBe(123);
      expect(res.data.user?.username).toBe('budi');
    }
  });

  it('rejects invalid hash', () => {
    const authDate = String(Math.floor(Date.now() / 1000) - 10);
    const payload: Record<string, string> = {
      user: JSON.stringify({ id: 1, first_name: 'A' }),
      auth_date: authDate,
    };
    let initData = createInitDataForTest(payload, BOT_TOKEN);
    // tamper hash
    initData = initData.replace(/hash=[^&]+/, 'hash=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    const res = validateTelegramInitData(initData, BOT_TOKEN);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toBe('invalid hash');
  });

  it('rejects expired auth_date', () => {
    const oldDate = String(Math.floor(Date.now() / 1000) - 100_000); // > 86400
    const payload: Record<string, string> = {
      user: JSON.stringify({ id: 2, first_name: 'X' }),
      auth_date: oldDate,
    };
    const initData = createInitDataForTest(payload, BOT_TOKEN);
    const res = validateTelegramInitData(initData, BOT_TOKEN, { maxAgeSec: 86400 });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toBe('auth_date expired');
  });

  it('rejects future auth_date beyond skew', () => {
    const future = String(Math.floor(Date.now() / 1000) + 600);
    const payload: Record<string, string> = {
      user: JSON.stringify({ id: 3, first_name: 'Y' }),
      auth_date: future,
    };
    const initData = createInitDataForTest(payload, BOT_TOKEN);
    const res = validateTelegramInitData(initData, BOT_TOKEN);
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.error).toBe('auth_date in future');
  });

  it('rejects missing hash', () => {
    const res = validateTelegramInitData('user=%7B%7D&auth_date=123', BOT_TOKEN);
    expect(res.valid).toBe(false);
  });

  it('rejects empty initData', () => {
    const res = validateTelegramInitData('', BOT_TOKEN);
    expect(res.valid).toBe(false);
  });

  it('rejects missing bot token', () => {
    const res = validateTelegramInitData('hash=abc&auth_date=123', '');
    expect(res.valid).toBe(false);
  });

  it('does not trust initDataUnsafe — validates via hash only', () => {
    // initData validation never reads global or unsafe object; hash is authority
    const authDate = String(Math.floor(Date.now() / 1000) - 5);
    const payload: Record<string, string> = {
      user: JSON.stringify({ id: 999, first_name: 'Evil' }),
      auth_date: authDate,
    };
    const good = createInitDataForTest(payload, BOT_TOKEN);
    const badTokenRes = validateTelegramInitData(good, 'wrong_token');
    expect(badTokenRes.valid).toBe(false);
  });
});
