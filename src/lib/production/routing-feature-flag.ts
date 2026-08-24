/**
 * Feature flag for flexible production routing.
 * Controls rollout per tenant: when OFF, demand board and run creation
 * fall back to legacy single-SPK flow. The environment variable is only the
 * global safety gate; the tenant AppSetting is the pilot allow-list.
 *
 * Default: OFF (safe for production until pilot tenant verified).
 * Toggle via environment variable ROUTING_ENABLED=true or admin toggle.
 */

import { tenantContext } from '@/lib/core/prisma';

const globalRoutingEnabled = process.env.ROUTING_ENABLED === 'true';
export const ROUTING_SETTING_KEY = 'feature.routing.enabled';

export async function isRoutingEnabled(): Promise<boolean> {
  if (!globalRoutingEnabled) return false;

  const tenantDb = tenantContext.getStore();
  if (!tenantDb) return globalRoutingEnabled;

  const setting = await tenantDb.appSetting.findUnique({
    where: { key: ROUTING_SETTING_KEY },
    select: { value: true },
  });
  return setting?.value === 'true';
}