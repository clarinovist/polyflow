/**
 * Canonical master data paths — single source of truth for entity CRUD.
 * Used by sidebars, Access Control UI, and permission checks.
 */
export const MASTER_PATHS = {
  boms: '/dashboard/boms',
  products: '/dashboard/products',
  machines: '/dashboard/machines',
  employees: '/dashboard/employees',
} as const;

/**
 * Portal alias paths — convenience entries that render the same data
 * within a portal's layout (no separate CRUD, no separate DB).
 *
 * Key = portal name, value = partial record of entity → alias path.
 */
export const PORTAL_ALIASES = {
  production: {
    boms: '/production/boms',
  },
} as const;

/**
 * Returns the alias path for a resource in a given portal, or undefined if none exists.
 */
export function getPortalAlias(
  portal: keyof typeof PORTAL_ALIASES,
  entity: keyof typeof MASTER_PATHS,
): string | undefined {
  const aliases = PORTAL_ALIASES[portal];
  if (!aliases) return undefined;
  return (aliases as Record<string, string>)[entity];
}
