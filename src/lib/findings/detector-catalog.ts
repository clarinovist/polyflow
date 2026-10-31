/**
 * Single source for which app resources gate each detector's findings.
 *
 * Every path must be a real app route that RolePermission rows can grant
 * (prefix semantics, see isPathAllowedByResources). A finding is visible to a
 * user who can open ANY of its resources. The route-existence test keeps typos
 * such as `/finance/invoices` vs `/sales/invoices` from silently routing a
 * finding to nobody.
 */
export const DETECTOR_RESOURCES = {
    critical_stock: ['/warehouse/inventory'],
    stuck_so: ['/sales/orders'],
    overdue_ar: ['/sales/invoices', '/finance/invoices'],
    overdue_ap: ['/purchasing/invoices', '/finance/invoices'],
    missing_finance_journal: ['/finance/journals'],
    production_no_progress: ['/production/orders'],
} as const satisfies Record<string, readonly string[]>;

export type DetectorKey = keyof typeof DETECTOR_RESOURCES;

export function detectorResources(detector: DetectorKey): string[] {
    return [...DETECTOR_RESOURCES[detector]];
}

/**
 * Detectors whose findings only disappear when the underlying business
 * condition clears (payment, restock, SO completion, journal posted...).
 * A manual "resolve" on these would be reopened by the next sync with a fresh
 * SLA, so the only manual actions are claim and snooze-with-note.
 * Every current detector is a condition detector.
 */
const CONDITION_DETECTORS: ReadonlySet<string> = new Set(
    Object.keys(DETECTOR_RESOURCES),
);

export function isConditionDetector(detector: string): boolean {
    return CONDITION_DETECTORS.has(detector);
}
