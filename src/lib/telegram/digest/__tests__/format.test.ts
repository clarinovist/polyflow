import { describe, it, expect } from 'vitest';
import { formatDigestMarkdown, toDigestFindings, type DigestFinding } from '../format';
import type { DetectionResult } from '../detection-types';

describe('formatDigestMarkdown', () => {
  it('returns null for empty findings', () => {
    expect(formatDigestMarkdown([])).toBeNull();
  });

  it('sorts critical before warning', () => {
    const findings: DigestFinding[] = [
      {
        detector: 'critical_stock',
        severity: 'warning',
        requiredResources: [],
        headline: 'Warning item',
      },
      {
        detector: 'overdue_ar',
        severity: 'critical',
        requiredResources: [],
        headline: 'Critical item',
      },
    ];

    const result = formatDigestMarkdown(findings);
    expect(result).not.toBeNull();
    const criticalIdx = result!.indexOf('Critical item');
    const warningIdx = result!.indexOf('Warning item');
    expect(criticalIdx).toBeLessThan(warningIdx);
  });

  it('groups by detector with labels', () => {
    const findings: DigestFinding[] = [
      {
        detector: 'critical_stock',
        severity: 'critical',
        requiredResources: [],
        headline: 'Product A low',
      },
      {
        detector: 'overdue_ar',
        severity: 'critical',
        requiredResources: [],
        headline: 'Invoice overdue',
      },
    ];

    const result = formatDigestMarkdown(findings);
    expect(result).toContain('Stok Kritis');
    expect(result).toContain('Invoice Jual Overdue');
  });

  it('includes detail lines', () => {
    const findings: DigestFinding[] = [
      {
        detector: 'critical_stock',
        severity: 'critical',
        requiredResources: [],
        headline: 'Product A',
        detail: '5 remaining',
      },
    ];

    const result = formatDigestMarkdown(findings);
    expect(result).toContain('5 remaining');
  });

  it('includes date header in WIB', () => {
    const findings: DigestFinding[] = [
      {
        detector: 'critical_stock',
        severity: 'critical',
        requiredResources: [],
        headline: 'Test',
      },
    ];

    const result = formatDigestMarkdown(findings, { timezone: 'Asia/Jakarta' });
    expect(result).toMatch(/Ringkasan Pengecualian —/);
  });
});

function makeResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    detector: 'critical_stock',
    status: 'ok',
    requiredResources: ['/warehouse/inventory'],
    items: [],
    ...overrides,
  };
}

describe('toDigestFindings', () => {
  it('flattens items from multiple ok detectors', () => {
    const results: DetectionResult[] = [
      makeResult({
        detector: 'critical_stock',
        items: [
          {
            entityKey: 'critical_stock:p-1',
            entityType: 'Product',
            entityId: 'p-1',
            severity: 'critical',
            headline: 'Karung: 5 < 20',
          },
        ],
      }),
      makeResult({
        detector: 'production_no_progress',
        requiredResources: ['/production/orders'],
        items: [
          {
            entityKey: 'production_no_progress:po-1',
            entityType: 'ProductionOrder',
            entityId: 'po-1',
            severity: 'warning',
            headline: 'SPK SPK-001',
            detail: '30 jam tanpa progres',
          },
        ],
      }),
    ];

    const findings = toDigestFindings(results);
    expect(findings).toHaveLength(2);
    expect(findings[0].headline).toBe('Karung: 5 < 20');
    expect(findings[1].headline).toBe('SPK SPK-001');
  });

  it('skips detectors with status failed entirely', () => {
    const results: DetectionResult[] = [
      makeResult({ status: 'failed', error: 'DB down', items: [] }),
    ];

    expect(toDigestFindings(results)).toHaveLength(0);
  });

  it('caps at maxItems and appends a summary row without overwriting real headlines', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      entityKey: `critical_stock:p-${i}`,
      entityType: 'Product',
      entityId: `p-${i}`,
      severity: 'critical' as const,
      headline: `Product ${i}: low`,
    }));
    const results: DetectionResult[] = [makeResult({ items })];

    const findings = toDigestFindings(results, 5);
    expect(findings).toHaveLength(6);
    // Real item #0's headline must survive untouched — this is the fix for
    // the old bug where the summary row overwrote it.
    expect(findings[0].headline).toBe('Product 0: low');
    expect(findings[4].headline).toBe('Product 4: low');
    expect(findings[5].headline).toContain('2 lainnya');
  });

  it('uses detector-specific remainder wording when available', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      entityKey: `stuck_so:so-${i}`,
      entityType: 'SalesOrder',
      entityId: `so-${i}`,
      severity: 'warning' as const,
      headline: `SO-00${i}`,
    }));
    const results: DetectionResult[] = [
      makeResult({
        detector: 'stuck_so',
        requiredResources: ['/sales/orders'],
        items,
      }),
    ];

    const findings = toDigestFindings(results, 5);
    expect(findings[5].headline).toBe('...dan 1 SO lain belum selesai');
  });

  it('does not append a summary row when items fit within maxItems', () => {
    const items = [
      {
        entityKey: 'critical_stock:p-1',
        entityType: 'Product',
        entityId: 'p-1',
        severity: 'critical' as const,
        headline: 'Product 1: low',
      },
    ];
    const results: DetectionResult[] = [makeResult({ items })];

    expect(toDigestFindings(results, 5)).toHaveLength(1);
  });
});
