/**
 * Shared mobile types for the operational suite.
 * Used by portal registry, UI shell, and domain-specific pages.
 */

export type MobileSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type MobileTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface MobileInsight {
    key: string;
    label: string;
    value: string | number;
    unit?: string;
    severity: MobileSeverity;
    trend?: {
        direction: 'UP' | 'DOWN' | 'FLAT';
        value: number;
        label: string;
    };
    href?: string;
    actionLabel?: string;
}

export interface MobileTask {
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    priority: MobileTaskPriority;
    dueAt?: string;
    href: string;
}

export interface MobilePortalSummary {
    generatedAt: string;
    highlights: MobileInsight[];
    tasks: MobileTask[];
}
