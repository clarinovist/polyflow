/**
 * Detail Journal Template Registry
 *
 * Defines templates for detail-input journals (BTKL, Piutang Karyawan, BPJS Kes/TK).
 * Each template controls: default accounts, direction, labels, and toggle behavior.
 *
 * @see docs/plans/2026-07-14-detail-journal-templates-piutang-bpjs.md
 */

export type DetailJournalDirection = 'OUTFLOW' | 'INFLOW';

export type DetailJournalTemplateKey =
  | 'DIRECT_LABOR'
  | 'EMPLOYEE_RECEIVABLE'
  | 'BPJS_HEALTH'
  | 'BPJS_EMPLOYMENT';

export type DetailJournalTemplate = {
  key: DetailJournalTemplateKey;
  label: string;
  detailSectionTitle: string;
  descriptionPlaceholder: string;
  detailNamePlaceholder: string;
  primaryAccountLabel: string;
  counterAccountLabel: string;
  helperText?: string;
  defaultDirection: DetailJournalDirection;
  allowDirectionToggle: boolean;
  outflowLabel?: string;
  inflowLabel?: string;
  primaryAccountCodes: string[];
  primaryNameHints: string[];
  counterAccountCodes: string[];
  counterNameHints: string[];
};

export const DETAIL_JOURNAL_TEMPLATES: Record<
  DetailJournalTemplateKey,
  DetailJournalTemplate
> = {
  DIRECT_LABOR: {
    key: 'DIRECT_LABOR',
    label: 'Biaya Tenaga Kerja Langsung',
    detailSectionTitle: 'Rincian Tenaga Kerja Langsung',
    descriptionPlaceholder:
      'e.g., BERITA ACARA CASH OPNAME 04 JULI 2026',
    detailNamePlaceholder: 'Nama pekerja',
    primaryAccountLabel: 'Akun Biaya (Tenaga Kerja Langsung)',
    counterAccountLabel: 'Akun Kas (Pembayaran)',
    defaultDirection: 'OUTFLOW',
    allowDirectionToggle: false,
    primaryAccountCodes: ['5-012b', '5-012', '51200'],
    primaryNameHints: [
      'Tenaga Kerja Langsung',
      'Direct Labor',
      'Upah Tenaga Kerja',
    ],
    counterAccountCodes: ['1-112', '11120'],
    counterNameHints: ['Kas Kecil', 'Petty Cash'],
  },
  EMPLOYEE_RECEIVABLE: {
    key: 'EMPLOYEE_RECEIVABLE',
    label: 'Piutang Karyawan',
    detailSectionTitle: 'Rincian Piutang Karyawan',
    descriptionPlaceholder: 'e.g., Kasbon karyawan 04 Jul 2026',
    detailNamePlaceholder: 'Nama karyawan / keterangan',
    primaryAccountLabel: 'Akun Piutang Karyawan',
    counterAccountLabel: 'Akun Kas Kecil',
    helperText:
      'Pilih arah: Keluar untuk kasbon, Masuk untuk pengembalian.',
    defaultDirection: 'OUTFLOW',
    allowDirectionToggle: true,
    outflowLabel: 'Keluar — Kasbon',
    inflowLabel: 'Masuk — Pengembalian',
    primaryAccountCodes: ['1-117', '11510'],
    primaryNameHints: ['Piutang Karyawan'],
    counterAccountCodes: ['1-112', '11120'],
    counterNameHints: ['Kas Kecil', 'Petty Cash'],
  },
  BPJS_HEALTH: {
    key: 'BPJS_HEALTH',
    label: 'Premi BPJS Kesehatan',
    detailSectionTitle: 'Rincian Premi BPJS Kesehatan',
    descriptionPlaceholder:
      'e.g., Terima premi BPJS Kesehatan 13 Jun 2026',
    detailNamePlaceholder: 'Nama karyawan',
    primaryAccountLabel: 'Akun BPJS Kesehatan',
    counterAccountLabel: 'Akun Kas Kecil (Penerimaan)',
    helperText:
      'Untuk penerimaan premi dari karyawan. BPJS Ketenagakerjaan diinput di template terpisah (2 jurnal).',
    defaultDirection: 'INFLOW',
    allowDirectionToggle: false,
    primaryAccountCodes: ['6-031'],
    primaryNameHints: ['BPJS Kesehatan', 'Premi BPJS Kesehatan'],
    counterAccountCodes: ['1-112', '11120'],
    counterNameHints: ['Kas Kecil', 'Petty Cash'],
  },
  BPJS_EMPLOYMENT: {
    key: 'BPJS_EMPLOYMENT',
    label: 'Premi BPJS Ketenagakerjaan',
    detailSectionTitle: 'Rincian Premi BPJS Ketenagakerjaan',
    descriptionPlaceholder:
      'e.g., Terima premi BPJS Ketenagakerjaan 13 Jun 2026',
    detailNamePlaceholder: 'Nama karyawan',
    primaryAccountLabel: 'Akun BPJS Ketenagakerjaan',
    counterAccountLabel: 'Akun Kas Kecil (Penerimaan)',
    helperText:
      'Untuk penerimaan premi dari karyawan. BPJS Kesehatan diinput di template terpisah (2 jurnal).',
    defaultDirection: 'INFLOW',
    allowDirectionToggle: false,
    primaryAccountCodes: ['6-033'],
    primaryNameHints: ['BPJS Ketenagakerjaan', 'Premi BPJS Ketenagakerjaan'],
    counterAccountCodes: ['1-112', '11120'],
    counterNameHints: ['Kas Kecil', 'Petty Cash'],
  },
};

/**
 * Get template by key, throws if not found.
 */
export function getDetailJournalTemplate(
  key: string,
): DetailJournalTemplate {
  const template = DETAIL_JOURNAL_TEMPLATES[key as DetailJournalTemplateKey];
  if (!template) {
    throw new Error(`Unknown detail journal template: ${key}`);
  }
  return template;
}

/**
 * Find the default account ID from the COA list by matching account codes or name hints.
 */
export function findDefaultAccountId(
  accounts: { id: string; code: string; name: string }[],
  codes: string[],
  nameHints: string[],
): string | undefined {
  // Try code match first (most reliable)
  for (const code of codes) {
    const found = accounts.find((a) => a.code === code);
    if (found) return found.id;
  }
  // Fallback to name hint
  for (const hint of nameHints) {
    const found = accounts.find((a) =>
      a.name.toLowerCase().includes(hint.toLowerCase()),
    );
    if (found) return found.id;
  }
  return undefined;
}
