import type { DetectionResult } from './detection-types';

export type DigestFinding = {
    detector: string;
    severity: 'warning' | 'critical';
    requiredResources: string[];
    headline: string;
    detail?: string;
};

const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    warning: 1,
};

const MAX_ITEMS = 5;

const REMAINDER_LABELS: Record<string, (count: number) => string> = {
    stuck_so: (count) => `...dan ${count} SO lain belum selesai`,
    overdue_ar: (count) => `...dan ${count} invoice overdue lainnya`,
    overdue_ap: (count) => `...dan ${count} invoice overdue lainnya`,
};

function remainderHeadline(detector: string, count: number): string {
    return REMAINDER_LABELS[detector]?.(count) ?? `...dan ${count} lainnya`;
}

/**
 * Presentation-layer capping: takes full DetectionResult[] and produces the
 * flat, capped DigestFinding[] used by the Telegram digest. Detection results
 * with status 'failed' are skipped (matches the old catch-and-return-empty
 * behavior for digest purposes — the failure itself is logged by the caller,
 * not swallowed here). A real item's headline is never overwritten by a
 * summary line — the summary is always its own extra entry.
 */
export function toDigestFindings(
    results: DetectionResult[],
    maxItems: number = MAX_ITEMS,
): DigestFinding[] {
    const findings: DigestFinding[] = [];

    for (const result of results) {
        if (result.status === 'failed') continue;

        const shown = result.items.slice(0, maxItems);
        for (const item of shown) {
            findings.push({
                detector: result.detector,
                severity: item.severity,
                requiredResources: result.requiredResources,
                headline: item.headline,
                detail: item.detail,
            });
        }

        const remainder = result.items.length - maxItems;
        if (remainder > 0) {
            findings.push({
                detector: result.detector,
                severity: shown[0]?.severity ?? 'warning',
                requiredResources: result.requiredResources,
                headline: remainderHeadline(result.detector, remainder),
            });
        }
    }

    return findings;
}

export function formatDigestMarkdown(
    findings: DigestFinding[],
    opts?: { timezone?: string },
): string | null {
    if (findings.length === 0) return null;

    const tz = opts?.timezone || 'Asia/Jakarta';
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: tz,
    });

    const sorted = [...findings].sort(
        (a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 99) -
            (SEVERITY_ORDER[b.severity] ?? 99),
    );

    const lines: string[] = [`*Ringkasan Pengecualian — ${dateStr}*`, ''];

    let lastDetector = '';
    for (const f of sorted) {
        if (f.detector !== lastDetector) {
            if (lastDetector) lines.push('');
            lines.push(`*${detectorLabel(f.detector)}*`);
            lastDetector = f.detector;
        }

        const icon = f.severity === 'critical' ? '🔴' : '🟡';
        lines.push(`${icon} ${f.headline}`);
        if (f.detail) lines.push(`   ${f.detail}`);
    }

    return lines.join('\n');
}

function detectorLabel(detector: string): string {
    const labels: Record<string, string> = {
        critical_stock: 'Stok Kritis',
        stuck_so: 'Sales Order Stuck',
        overdue_ar: 'Invoice Jual Overdue',
        overdue_ap: 'Invoice Beli Overdue',
        production_no_progress: 'Produksi Tanpa Progres',
    };
    return labels[detector] || detector;
}
