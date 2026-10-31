/**
 * Per-tenant rollout mode for the Finding lifecycle.
 *
 * - off:     nothing runs for the tenant (default).
 * - observe: detectors sync into Finding as baseline (no SLA) — no
 *            notifications, escalations, or Telegram messages.
 * - notify:  new findings get an SLA. Delivery side-effects (inbox, digest,
 *            escalation) arrive in later phases of
 *            docs/plan/2026-10-31-finding-digest.md.
 *
 * Driven by env so a rollout step needs no deploy:
 *   FINDINGS_OBSERVE_TENANTS=sub-a,sub-b
 *   FINDINGS_NOTIFY_TENANTS=sub-a
 * A subdomain listed in both resolves to `observe` (the safer mode).
 */
export type FindingsMode = 'off' | 'observe' | 'notify';

type ModeEnv = Record<string, string | undefined>;

function parseSubdomainList(value: string | undefined): Set<string> {
    return new Set(
        (value ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    );
}

export function getFindingsMode(
    subdomain: string,
    env: ModeEnv = process.env,
): FindingsMode {
    const key = subdomain.trim().toLowerCase();
    if (!key) return 'off';
    if (parseSubdomainList(env.FINDINGS_OBSERVE_TENANTS).has(key)) {
        return 'observe';
    }
    if (parseSubdomainList(env.FINDINGS_NOTIFY_TENANTS).has(key)) {
        return 'notify';
    }
    return 'off';
}
