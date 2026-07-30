import crypto from 'crypto';

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type ParsedInitData = {
  user?: TelegramUser;
  chat_instance?: string;
  chat_type?: string;
  start_param?: string;
  auth_date: number;
  hash: string;
  raw: Record<string, string>;
};

export type ValidateResult =
  | { valid: true; data: ParsedInitData }
  | { valid: false; error: string };

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function parseInitDataString(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData);
  const obj: Record<string, string> = {};
  params.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  opts?: { maxAgeSec?: number },
): ValidateResult {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, error: 'initData required' };
  }
  if (!botToken) {
    return { valid: false, error: 'botToken required' };
  }

  const parsed = parseInitDataString(initData);
  const receivedHash = parsed.hash;
  if (!receivedHash) {
    return { valid: false, error: 'missing hash' };
  }

  // Build data_check_string per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
  const keys = Object.keys(parsed)
    .filter((k) => k !== 'hash')
    .sort();
  const dataCheckString = keys.map((k) => `${k}=${parsed[k]}`).join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (!timingSafeEqualHex(computedHash, receivedHash)) {
    return { valid: false, error: 'invalid hash' };
  }

  const authDateStr = parsed.auth_date;
  if (!authDateStr) {
    return { valid: false, error: 'missing auth_date' };
  }
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate)) {
    return { valid: false, error: 'invalid auth_date' };
  }

  const maxAgeSec =
    opts?.maxAgeSec ??
    Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || 86400);
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > maxAgeSec) {
    return { valid: false, error: 'auth_date expired' };
  }
  // Future skew tolerance 5 min
  if (authDate - nowSec > 300) {
    return { valid: false, error: 'auth_date in future' };
  }

  let user: TelegramUser | undefined;
  if (parsed.user) {
    try {
      user = JSON.parse(parsed.user) as TelegramUser;
    } catch {
      return { valid: false, error: 'invalid user json' };
    }
  }

  const result: ParsedInitData = {
    user,
    chat_instance: parsed.chat_instance,
    chat_type: parsed.chat_type,
    start_param: parsed.start_param,
    auth_date: authDate,
    hash: receivedHash,
    raw: parsed,
  };

  return { valid: true, data: result };
}

// Helper for tests: create valid initData given payload
export function createInitDataForTest(
  payload: Record<string, string>,
  botToken: string,
): string {
  const keys = Object.keys(payload)
    .filter((k) => k !== 'hash')
    .sort();
  const dataCheckString = keys.map((k) => `${k}=${payload[k]}`).join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  const params = new URLSearchParams({ ...payload, hash });
  return params.toString();
}
