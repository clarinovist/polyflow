import { getExecutiveSalesMetrics } from '@/services/sales/executive-metrics-service';
import { getExecutivePurchasingMetrics } from '@/services/purchasing/executive-metrics-service';
import {
    getExecutiveFinanceMetrics,
    type ExecutiveFinanceMetrics,
} from '@/services/finance/executive-metrics-service';
import { getExecutiveProductionMetrics } from '@/services/production/executive-metrics-service';
import { InventoryQueryService } from '@/services/inventory/query-service';
import type { ModuleKey } from '@/lib/modules/module-registry';

export type ExecutiveSectionKey =
    | 'sales'
    | 'purchasing'
    | 'production'
    | 'inventory'
    | 'finance';
export type ExecutiveSectionState = 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN';

type SalesSection = Awaited<ReturnType<typeof getExecutiveSalesMetrics>> & {
    mtdRevenue: number | null;
    pendingInvoices: number | null;
    overdueReceivables: number | null;
    invoicesDueThisWeek: number | null;
    trend?: number;
    revenueTrendChart: ExecutiveFinanceMetrics['revenueTrendChart'];
};
type PurchasingSection = Awaited<
    ReturnType<typeof getExecutivePurchasingMetrics>
> & {
    mtdSpending: number | null;
    overduePayables: number | null;
    trend?: number;
};

export type ExecutiveStats = {
    generatedAt: string;
    sections: Record<ExecutiveSectionKey, ExecutiveSectionState>;
    sales: SalesSection | null;
    purchasing: PurchasingSection | null;
    production: Awaited<
        ReturnType<typeof getExecutiveProductionMetrics>
    > | null;
    inventory: Awaited<
        ReturnType<typeof InventoryQueryService.getExecutiveMetrics>
    > | null;
    finance: ExecutiveFinanceMetrics | null;
};

export type ExecutiveStatsOptions = {
    sections?: readonly ExecutiveSectionKey[];
    activeModules?: readonly string[];
    now?: Date;
};

const ALL_SECTIONS: ExecutiveSectionKey[] = [
    'sales',
    'purchasing',
    'production',
    'inventory',
    'finance',
];
const SECTION_MODULE: Record<ExecutiveSectionKey, ModuleKey> = {
    sales: 'SALES',
    purchasing: 'PURCHASING',
    production: 'PRODUCTION',
    inventory: 'INVENTORY',
    finance: 'FINANCE',
};

function selectedSections(options: ExecutiveStatsOptions) {
    const requested = new Set(options.sections ?? ALL_SECTIONS);
    const active = options.activeModules
        ? new Set(options.activeModules)
        : undefined;
    return ALL_SECTIONS.filter(
        (key) =>
            requested.has(key) && (!active || active.has(SECTION_MODULE[key])),
    );
}

export class ExecutiveStatsService {
    static async getExecutiveStats(
        options: ExecutiveStatsOptions = {},
    ): Promise<ExecutiveStats> {
        const now = options.now ?? new Date();
        const selected = selectedSections(options);
        const financeModuleActive =
            !options.activeModules || options.activeModules.includes('FINANCE');
        const needsFinance =
            financeModuleActive &&
            selected.some((key) =>
                ['sales', 'purchasing', 'finance'].includes(key),
            );
        const financePromise = needsFinance
            ? getExecutiveFinanceMetrics(now, {
                  includeBalanceSheet: selected.includes('finance'),
              })
            : null;
        const financeForComposition =
            financePromise?.catch(() => null) ?? Promise.resolve(null);
        const loaders: Partial<
            Record<ExecutiveSectionKey, () => Promise<unknown>>
        > = {
            sales: async () => ({
                ...(await getExecutiveSalesMetrics(now)),
                ...salesFinanceSlice(await financeForComposition),
            }),
            purchasing: async () => ({
                ...(await getExecutivePurchasingMetrics()),
                ...purchasingFinanceSlice(await financeForComposition),
            }),
            production: () => getExecutiveProductionMetrics(now),
            inventory: () => InventoryQueryService.getExecutiveMetrics(),
            finance: () => financePromise!,
        };
        const settled = await Promise.allSettled(
            selected.map((key) => loaders[key]!()),
        );
        const values = new Map<ExecutiveSectionKey, unknown>();
        const sections = Object.fromEntries(
            ALL_SECTIONS.map((key) => [key, 'HIDDEN']),
        ) as ExecutiveStats['sections'];

        settled.forEach((result, index) => {
            const key = selected[index];
            if (result.status === 'fulfilled') {
                sections[key] = 'AVAILABLE';
                values.set(key, result.value);
            } else {
                sections[key] = 'UNAVAILABLE';
            }
        });

        return {
            generatedAt: new Date().toISOString(),
            sections,
            sales: (values.get('sales') as SalesSection | undefined) ?? null,
            purchasing:
                (values.get('purchasing') as PurchasingSection | undefined) ??
                null,
            production:
                (values.get('production') as ExecutiveStats['production']) ??
                null,
            inventory:
                (values.get('inventory') as ExecutiveStats['inventory']) ??
                null,
            finance:
                (values.get('finance') as ExecutiveStats['finance']) ?? null,
        };
    }
}

function salesFinanceSlice(finance: ExecutiveFinanceMetrics | null) {
    return {
        mtdRevenue: finance?.mtdRevenue ?? null,
        pendingInvoices: finance?.pendingInvoices ?? null,
        overdueReceivables: finance?.overdueReceivables ?? null,
        invoicesDueThisWeek: finance?.invoicesDueThisWeek ?? null,
        trend: finance?.revenueTrend,
        revenueTrendChart: finance?.revenueTrendChart ?? [],
    };
}

function purchasingFinanceSlice(finance: ExecutiveFinanceMetrics | null) {
    return {
        mtdSpending: finance?.mtdSpending ?? null,
        overduePayables: finance?.overduePayables ?? null,
        trend: finance?.spendingTrend,
    };
}
