import type { DigestFinding } from './detectors';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
};

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
