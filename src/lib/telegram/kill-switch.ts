export function isKillSwitchActive(): boolean {
  const v = process.env.TELEGRAM_KILL_SWITCH;
  if (!v) return false;
  return v === 'true' || v === '1' || v.toLowerCase() === 'on';
}

export function getPilotSubdomain(): string {
  return process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN || 'melindo';
}
