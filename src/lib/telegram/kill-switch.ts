export function isKillSwitchActive(): boolean {
  const v = process.env.TELEGRAM_KILL_SWITCH;
  if (!v) return false;
  return v === 'true' || v === '1' || v.toLowerCase() === 'on';
}

export function isMiniAppEnabled(): boolean {
  const disabled = process.env.TELEGRAM_MINI_APP_ENABLED;
  if (disabled === 'false' || disabled === '0') return false;
  if (isKillSwitchActive()) return false;
  return true;
}

export function getPilotSubdomain(): string {
  return process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN || 'melindo';
}

export function getMiniAppUrl(): string {
  return (
    process.env.TELEGRAM_MINI_APP_URL ||
    `https://${getPilotSubdomain()}.polyflow.uk/telegram`
  );
}

export function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

export function getBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || 'pico2004_bot';
}

export function getWebhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET;
}

export function getSessionCookieName(): string {
  return process.env.TELEGRAM_SESSION_COOKIE_NAME || 'polyflow_tg';
}

export function getSessionMaxAgeSec(): number {
  return Number(process.env.TELEGRAM_SESSION_MAX_AGE_SEC || 3600);
}

export function getInitDataMaxAgeSec(): number {
  return Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SEC || 86400);
}
