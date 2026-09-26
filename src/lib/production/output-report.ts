import { parseBusinessDate, toBusinessDateString } from '@/lib/utils/timezone';
import { PROCESS_KEYS, type ProcessKey } from './process-keys';

export const OUTPUT_REPORT_PATH = '/production/output-report';
export const UNASSIGNED = 'unassigned';
export const REPORT_PAGE_SIZE = 50;
export const PROCESS_LABELS: Record<ProcessKey, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extru',
    PACKING: 'Packing',
    OTHER: 'Lainnya',
};
export const REPORT_MODES = {
    order: 'Per SPK',
    product: 'Per Produk',
    operator: 'Per Operator',
    entries: 'Rincian Entri',
} as const;
export const ORDER_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draf',
    RELEASED: 'Dirilis',
    IN_PROGRESS: 'Berjalan',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
    WAITING_MATERIAL: 'Menunggu bahan',
};
export type ReportMode = keyof typeof REPORT_MODES;
export type ReportSearchParams = Record<string, string | string[] | undefined>;
export interface OutputReportFilter {
    from: string;
    to: string;
    process: ProcessKey | '';
    productVariantId: string;
    operatorId: string;
    machineId: string;
    q: string;
    mode: ReportMode;
    page: number;
}
export class OutputReportFilterError extends Error {}

export function parseOutputReportFilter(
    params: ReportSearchParams,
    now = new Date(),
): OutputReportFilter {
    const value = (key: string): string => {
        const raw = params[key];
        if (Array.isArray(raw))
            throw new OutputReportFilterError('Filter tidak boleh berulang.');
        return raw?.trim() ?? '';
    };
    const today = toBusinessDateString(now);
    const from = value('from') || `${today.slice(0, 7)}-01`;
    const to = value('to') || today;
    try {
        parseBusinessDate(from);
        parseBusinessDate(to);
    } catch {
        throw new OutputReportFilterError(
            'Tanggal harus valid dalam format YYYY-MM-DD.',
        );
    }
    if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 >= 366) {
        throw new OutputReportFilterError(
            'Periode harus berurutan dan maksimal 366 hari.',
        );
    }
    const process = value('process');
    if (process && !PROCESS_KEYS.includes(process as ProcessKey)) {
        throw new OutputReportFilterError('Proses tidak valid.');
    }
    const mode = value('mode') || 'product';
    if (!Object.hasOwn(REPORT_MODES, mode))
        throw new OutputReportFilterError('Tampilan tidak valid.');
    const page = value('page') || '1';
    if (!/^[1-9]\d{0,6}$/.test(page))
        throw new OutputReportFilterError('Halaman tidak valid.');
    const id = (key: string) => {
        const result = value(key);
        if (result && !/^[\w-]{1,100}$/.test(result)) {
            throw new OutputReportFilterError('Pilihan filter tidak valid.');
        }
        return result;
    };
    const q = value('q');
    if (q.length > 120)
        throw new OutputReportFilterError('Pencarian maksimal 120 karakter.');
    return {
        from,
        to,
        process: process as OutputReportFilter['process'],
        productVariantId: id('productVariantId'),
        operatorId: id('operatorId'),
        machineId: id('machineId'),
        q,
        mode: mode as ReportMode,
        page: Number(page),
    };
}

export function outputReportHref(
    filter: OutputReportFilter,
    updates: Partial<OutputReportFilter> = {},
): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filter, ...updates })) {
        if (value !== '') params.set(key, String(value));
    }
    return `${OUTPUT_REPORT_PATH}?${params}`;
}

/** Server-provided WIB date, never the browser's local calendar. */
export function reportPresets(today: string) {
    const current = `${today.slice(0, 7)}-01`;
    const previousEnd = new Date(`${current}T00:00:00Z`);
    previousEnd.setUTCDate(0);
    const last = previousEnd.toISOString().slice(0, 10);
    return [
        { label: 'Hari ini', from: today, to: today },
        { label: 'Bulan ini', from: current, to: today },
        { label: 'Bulan lalu', from: `${last.slice(0, 7)}-01`, to: last },
    ];
}

export interface ReportOption {
    id: string;
    label: string;
}
export interface OutputIdentity {
    productVariantId: string;
    productName: string;
    variantName: string;
    sku: string;
    productType: string;
    process: ProcessKey;
    unit: string;
}
export interface OutputReportEntry extends OutputIdentity {
    id: string;
    orderId: string;
    orderNumber: string;
    startTime: string;
    endTime: string | null;
    operatorId: string;
    operatorName: string;
    operatorSource: 'execution' | 'shift' | 'missing';
    machineId: string;
    machineName: string;
    category: string;
    produced: string;
    scrapKg: string | null;
    scrapRaw: string;
    enteredQuantity: string | null;
    enteredUnit: string | null;
}
export interface OutputReportRow extends OutputIdentity {
    key: string;
    operatorId: string | null;
    operators: ReportOption[];
    produced: string;
    scrapKg: string | null;
    entries: number;
    orders: number;
}
/**
 * Target only exists at SPK level (`ProductionOrder.plannedQuantity`), so
 * pencapaian is reported per SPK — never split across days or shifts. The
 * period columns stay separate from the cumulative SPK progress.
 */
export interface OutputOrderRow {
    orderId: string;
    orderNumber: string;
    status: string;
    plannedStartDate: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    sku: string;
    productType: string;
    unit: string;
    hasTarget: boolean;
    target: string;
    producedInPeriod: string;
    producedCumulative: string;
    difference: string | null;
    achievement: string | null;
}
export interface OutputReport {
    filter: OutputReportFilter;
    options: {
        products: ReportOption[];
        operators: ReportOption[];
        machines: ReportOption[];
    };
    summary: {
        products: number;
        entries: number;
        orders: number;
        totals: { process: ProcessKey; unit: string; produced: string }[];
    };
    rows: OutputReportRow[];
    orders: OutputOrderRow[];
    entries: OutputReportEntry[];
    totalRows: number;
    pageCount: number;
}
