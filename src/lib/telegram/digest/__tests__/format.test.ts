import { describe, it, expect } from 'vitest';
import { formatDigestMarkdown } from '../format';
import type { DigestFinding } from '../detectors';

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
