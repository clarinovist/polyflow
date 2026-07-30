export function parseAllowlistEmails(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowlisted(
  email: string | undefined | null,
  allowlistRaw?: string,
): { allowed: boolean; isEmpty: boolean } {
  const allow = parseAllowlistEmails(
    allowlistRaw ?? process.env.TELEGRAM_PILOT_ADMIN_ALLOWLIST,
  );
  if (allow.length === 0) return { allowed: true, isEmpty: true };
  if (!email) return { allowed: false, isEmpty: false };
  return { allowed: allow.includes(email.toLowerCase()), isEmpty: false };
}

export type PilotUser = {
  role?: string | null;
  roles?: (string | null | undefined)[];
  email?: string | null;
  isSuperAdmin?: boolean;
};

function getAllRolesUpper(user: PilotUser): string[] {
  const out: string[] = [];
  if (user.role) out.push(String(user.role).toUpperCase());
  if (user.roles) {
    for (const r of user.roles) {
      if (r) out.push(String(r).toUpperCase());
    }
  }
  return [...new Set(out)];
}

export function isAdminRole(user: PilotUser): boolean {
  if (user.isSuperAdmin) return true;
  const roles = getAllRolesUpper(user);
  return roles.includes('ADMIN');
}

export function checkPilotAdminGate(user: PilotUser): {
  allowed: boolean;
  reason?: string;
} {
  if (!isAdminRole(user)) {
    return { allowed: false, reason: 'ADMIN role required' };
  }
  const { allowed, isEmpty } = isEmailAllowlisted(user.email ?? undefined);
  if (!isEmpty && !allowed) {
    return { allowed: false, reason: 'not in pilot allowlist' };
  }
  return { allowed: true };
}

export function isPilotTenant(subdomain: string | null | undefined): boolean {
  if (!subdomain) return false;
  const pilot = (
    process.env.TELEGRAM_PILOT_TENANT_SUBDOMAIN || 'melindo'
  ).toLowerCase();
  return subdomain.toLowerCase() === pilot;
}

export function checkPilotEligibility(params: {
  user: PilotUser;
  subdomain: string | null | undefined;
}): { allowed: boolean; reason?: string } {
  if (!isPilotTenant(params.subdomain)) {
    return { allowed: false, reason: 'tenant not pilot' };
  }
  return checkPilotAdminGate(params.user);
}
