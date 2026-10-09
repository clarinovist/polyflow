import { Prisma, type PrismaClient } from '@prisma/client';
import type { ModuleKey } from '@/lib/modules/module-registry';
import type { MobilePortalInfo } from '@/lib/mobile/mobile-portal-decision';
import type { MobilePortalDependency } from '@/lib/mobile/mobile-portal-registry';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';
import { isInventoryThresholdTriggered } from '@/lib/constants/locations';

const ADMIN_MODULES = [
    'PRODUCTION',
    'INVENTORY',
    'PURCHASING',
    'FINANCE',
    'HRD',
] as const satisfies readonly ModuleKey[];

export type AdminMobileModuleKey = (typeof ADMIN_MODULES)[number];
type AdminModuleKey = AdminMobileModuleKey;
type AdminModuleState = 'AVAILABLE' | 'UNAVAILABLE';
type AdminSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AdminMobileModuleStatus {
    key: AdminModuleKey;
    label: string;
    state: AdminModuleState;
    exceptionCount: number | null;
    approvalCount: number | null;
}

export type AdminMobileTaskType =
    | 'open-issues'
    | 'late-orders'
    | 'maintenance-approval'
    | 'low-stock'
    | 'open-requests'
    | 'waiting-receipt'
    | 'overdue-invoices'
    | 'overdue-ar'
    | 'overdue-ap'
    | 'draft-journals'
    | 'open-reconciliation'
    | 'pending-leave';

export interface AdminMobileTask {
    id: string;
    module: AdminModuleKey;
    type: AdminMobileTaskType;
    title: string;
    count: number;
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
    href: string | null;
}

export interface AdminMobileHighlight {
    key: string;
    label: string;
    value: number | string;
    severity: AdminSeverity;
}

export interface AdminMobileShortcut {
    id: MobilePortalInfo['id'];
    label: string;
    href: string;
}

export interface AdminMobileOverview {
    generatedAt: string;
    highlights: AdminMobileHighlight[];
    tasks: AdminMobileTask[];
    counts: { total: number; returned: number };
    modules: AdminMobileModuleStatus[];
    shortcuts: AdminMobileShortcut[];
    unavailableModules: AdminModuleKey[];
}

export interface AdminMobileSectionResult {
    generatedAt: string;
    tasks: AdminMobileTask[];
    counts: { total: number; returned: number };
    modules: AdminMobileModuleStatus[];
    unavailableModules: AdminModuleKey[];
}

interface AdminMobileServiceContext {
    activeModules: readonly ModuleKey[];
    permissions: readonly string[] | 'ALL';
    availablePortals: readonly MobilePortalInfo[];
    dataDependencies: readonly MobilePortalDependency[];
    onlyModules?: readonly AdminMobileModuleKey[];
}

type TenantDb = Pick<
    PrismaClient,
    | '$transaction'
    | 'productionIssue'
    | 'productionOrder'
    | 'maintenanceRequest'
    | 'productVariant'
    | 'purchaseRequest'
    | 'purchaseOrder'
    | 'invoice'
    | 'purchaseInvoice'
    | 'journalEntry'
    | 'bankReconciliation'
    | 'leaveRequest'
>;
type QueryDb = Omit<TenantDb, '$transaction'>;

interface ModuleSnapshot {
    exceptionCount: number;
    approvalCount: number;
    tasks: AdminMobileTask[];
}

const MODULE_LABELS: Record<AdminModuleKey, string> = {
    PRODUCTION: 'Produksi',
    INVENTORY: 'Stok',
    PURCHASING: 'Purchasing',
    FINANCE: 'Finance',
    HRD: 'HRD',
};

function isModuleAuthorized(
    key: AdminModuleKey,
    activeModules: readonly ModuleKey[],
    permissions: readonly string[] | 'ALL',
    dependencies: AdminMobileServiceContext['dataDependencies'],
): boolean {
    if (!activeModules.includes(key)) return false;
    const dependency = dependencies.find(
        (candidate) => candidate.moduleKey === key,
    );
    if (!dependency) return false;
    const matches = dependency.permissionRoots.map((root) =>
        canSeeNavHref(root, permissions === 'ALL' ? 'ALL' : [...permissions]),
    );
    return dependency.match === 'ALL'
        ? matches.every(Boolean)
        : matches.some(Boolean);
}

function task(
    module: AdminModuleKey,
    type: AdminMobileTaskType,
    title: string,
    count: number,
    priority: AdminMobileTask['priority'],
    href: string | null,
): AdminMobileTask {
    return {
        id: `${module.toLowerCase()}:${type}`,
        module,
        type,
        title,
        count,
        priority,
        href,
    };
}

async function readProduction(db: QueryDb): Promise<ModuleSnapshot> {
    const [openIssues, lateOrders, pendingMaintenance] = await Promise.all([
        db.productionIssue.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        db.productionOrder.count({
            where: {
                status: { in: ['RELEASED', 'IN_PROGRESS', 'WAITING_MATERIAL'] },
                plannedEndDate: { lt: new Date() },
            },
        }),
        db.maintenanceRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return {
        exceptionCount: openIssues + lateOrders,
        approvalCount: pendingMaintenance,
        tasks: [
            task('PRODUCTION', 'open-issues', 'Isu produksi terbuka', openIssues, 'URGENT', '/production/mobile'),
            task('PRODUCTION', 'late-orders', 'SPK melewati target', lateOrders, 'HIGH', '/production/mobile'),
            task('PRODUCTION', 'maintenance-approval', 'Maintenance menunggu persetujuan', pendingMaintenance, 'HIGH', '/production/mobile/maintenance'),
        ],
    };
}

async function readInventory(db: QueryDb): Promise<ModuleSnapshot> {
    const variants = await db.productVariant.findMany({
        where: { minStockAlert: { not: null }, archivedAt: null },
        select: {
            id: true,
            minStockAlert: true,
            inventories: {
                select: {
                    quantity: true,
                    location: { select: { locationPurpose: true, locationType: true } },
                },
            },
        },
    });
    const lowStock = variants.filter((variant) =>
        isInventoryThresholdTriggered(
            variant.inventories,
            variant.minStockAlert,
        ),
    ).length;
    return {
        exceptionCount: lowStock,
        approvalCount: 0,
        tasks: [
            task('INVENTORY', 'low-stock', 'Varian stok rendah', lowStock, 'URGENT', '/warehouse/mobile'),
        ],
    };
}

async function readPurchasing(db: QueryDb): Promise<ModuleSnapshot> {
    const now = new Date();
    const [openRequests, waitingReceipt, overdueInvoices] = await Promise.all([
        db.purchaseRequest.count({ where: { status: 'OPEN' } }),
        db.purchaseOrder.count({ where: { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } } }),
        db.purchaseInvoice.count({
            where: {
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                dueDate: { lt: now },
                totalAmount: { gt: db.purchaseInvoice.fields.paidAmount },
            },
        }),
    ]);
    return {
        exceptionCount: waitingReceipt + overdueInvoices,
        approvalCount: openRequests,
        tasks: [
            task('PURCHASING', 'open-requests', 'PR menunggu persetujuan', openRequests, 'HIGH', '/purchasing/mobile'),
            task('PURCHASING', 'waiting-receipt', 'PO menunggu penerimaan', waitingReceipt, 'HIGH', '/purchasing/mobile'),
            task('PURCHASING', 'overdue-invoices', 'Invoice pembelian overdue', overdueInvoices, 'URGENT', '/purchasing/mobile'),
        ],
    };
}

async function readFinance(db: QueryDb): Promise<ModuleSnapshot> {
    const now = new Date();
    const [overdueReceivables, overduePayables, draftJournals, openReconciliations] =
        await Promise.all([
            db.invoice.count({
                where: {
                    status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: now },
                    remainingAmount: { gt: 0 },
                    salesOrder: {
                        customerId: { not: null },
                        NOT: [
                            { orderNumber: { startsWith: 'SO-OPEN-' } },
                            { orderNumber: { startsWith: 'OB-AR-' } },
                            { notes: { startsWith: 'Opening Balance Entry' } },
                            { notes: { startsWith: 'Sheet Penjualan Jun:' } },
                        ],
                    },
                },
            }),
            db.purchaseInvoice.count({
                where: {
                    status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: now },
                    totalAmount: { gt: db.purchaseInvoice.fields.paidAmount },
                },
            }),
            db.journalEntry.count({ where: { status: 'DRAFT' } }),
            db.bankReconciliation.count({ where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } } }),
        ]);
    return {
        exceptionCount:
            overdueReceivables + overduePayables + draftJournals + openReconciliations,
        approvalCount: draftJournals,
        tasks: [
            task('FINANCE', 'overdue-ar', 'Piutang overdue', overdueReceivables, 'URGENT', '/finance/mobile'),
            task('FINANCE', 'overdue-ap', 'Hutang overdue', overduePayables, 'URGENT', '/finance/mobile'),
            task('FINANCE', 'draft-journals', 'Draft jurnal perlu ditinjau', draftJournals, 'HIGH', null),
            task('FINANCE', 'open-reconciliation', 'Rekonsiliasi masih terbuka', openReconciliations, 'HIGH', null),
        ],
    };
}

async function readHrd(db: QueryDb): Promise<ModuleSnapshot> {
    const pendingLeave = await db.leaveRequest.count({
        where: { status: 'PENDING' },
    });
    return {
        exceptionCount: pendingLeave,
        approvalCount: pendingLeave,
        tasks: [
            task('HRD', 'pending-leave', 'Cuti menunggu persetujuan', pendingLeave, 'HIGH', '/hrd/mobile'),
        ],
    };
}

const READERS: Record<AdminModuleKey, (db: QueryDb) => Promise<ModuleSnapshot>> = {
    PRODUCTION: readProduction,
    INVENTORY: readInventory,
    PURCHASING: readPurchasing,
    FINANCE: readFinance,
    HRD: readHrd,
};

const PRIORITY_ORDER: Record<AdminMobileTask['priority'], number> = {
    URGENT: 0,
    HIGH: 1,
    NORMAL: 2,
};

function buildHighlights(
    modules: AdminMobileModuleStatus[],
    totalTasks: number,
): AdminMobileHighlight[] {
    const available = modules.filter((module) => module.state === 'AVAILABLE');
    const unavailable = modules.length - available.length;
    const totalExceptions = available.reduce(
        (sum, module) => sum + (module.exceptionCount ?? 0),
        0,
    );
    const totalApprovals = available.reduce(
        (sum, module) => sum + (module.approvalCount ?? 0),
        0,
    );
    return [
        {
            key: 'exceptions',
            label: 'Total pengecualian',
            value: totalExceptions,
            severity: totalExceptions > 0 ? 'CRITICAL' : 'INFO',
        },
        {
            key: 'approvals',
            label: 'Menunggu persetujuan',
            value: totalApprovals,
            severity: totalApprovals > 0 ? 'WARNING' : 'INFO',
        },
        {
            key: 'tasks',
            label: 'Total kelompok tugas',
            value: totalTasks,
            severity: totalTasks > 0 ? 'WARNING' : 'INFO',
        },
        {
            key: 'modules',
            label: 'Modul tersedia',
            value: unavailable > 0 ? `${available.length}/${modules.length}` : available.length,
            severity: unavailable > 0 ? 'WARNING' : 'INFO',
        },
    ];
}

function shortcutHref(portal: MobilePortalInfo): string | null {
    if (portal.id === 'admin' || portal.status === 'PLANNED') return null;
    return portal.path;
}

export class MobileAdminService {
    static async getModuleSections(
        context: AdminMobileServiceContext,
        tenantDb: TenantDb | undefined = getTenantDbFromContext(),
    ): Promise<AdminMobileSectionResult> {
        if (!tenantDb) {
            throw new BusinessRuleError('Konteks tenant Admin Mobile tidak tersedia.');
        }

        const requestedModules = new Set(
            context.onlyModules ?? ADMIN_MODULES,
        );
        const entitledModules = ADMIN_MODULES.filter(
            (moduleKey) =>
                requestedModules.has(moduleKey) &&
                context.activeModules.includes(moduleKey) &&
                context.dataDependencies.some(
                    (dependency) => dependency.moduleKey === moduleKey,
                ),
        );
        const queryableModules = entitledModules.filter((moduleKey) =>
            isModuleAuthorized(
                moduleKey,
                context.activeModules,
                context.permissions,
                context.dataDependencies,
            ),
        );
        const settled = await Promise.allSettled(
            queryableModules.map(async (moduleKey) => ({
                moduleKey,
                snapshot: await tenantDb.$transaction(
                    (transaction: Prisma.TransactionClient) =>
                        READERS[moduleKey](transaction),
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.RepeatableRead,
                    },
                ),
            })),
        );
        const snapshots = new Map<AdminModuleKey, ModuleSnapshot>();
        const unavailableModules: AdminModuleKey[] = entitledModules.filter(
            (moduleKey) => !queryableModules.includes(moduleKey),
        );
        settled.forEach((result, index) => {
            const moduleKey = queryableModules[index];
            if (result.status === 'fulfilled') {
                snapshots.set(moduleKey, result.value.snapshot);
            } else {
                unavailableModules.push(moduleKey);
            }
        });

        const modules = queryableModules.map(
            (moduleKey): AdminMobileModuleStatus => {
                const snapshot = snapshots.get(moduleKey);
                return snapshot
                    ? {
                          key: moduleKey,
                          label: MODULE_LABELS[moduleKey],
                          state: 'AVAILABLE',
                          exceptionCount: snapshot.exceptionCount,
                          approvalCount: snapshot.approvalCount,
                      }
                    : {
                          key: moduleKey,
                          label: MODULE_LABELS[moduleKey],
                          state: 'UNAVAILABLE',
                          exceptionCount: null,
                          approvalCount: null,
                      };
            },
        );
        const portalPaths = new Set(
            context.availablePortals
                .map(shortcutHref)
                .filter((path): path is string => path !== null),
        );
        const tasks = [...snapshots.values()]
            .flatMap((snapshot) => snapshot.tasks)
            .filter((item) => item.count > 0)
            .map((item) => ({
                ...item,
                href:
                    item.href &&
                    [...portalPaths].some(
                        (portalPath) =>
                            item.href === portalPath ||
                            item.href?.startsWith(`${portalPath}/`),
                    )
                        ? item.href
                        : null,
            }))
            .sort(
                (a, b) =>
                    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
                    b.count - a.count ||
                    a.id.localeCompare(b.id),
            );
        const sampledTasks = tasks.slice(0, 10);

        return {
            generatedAt: new Date().toISOString(),
            tasks: sampledTasks,
            counts: { total: tasks.length, returned: sampledTasks.length },
            modules,
            unavailableModules,
        };
    }

    static async getOverview(
        context: AdminMobileServiceContext,
        tenantDb: TenantDb | undefined = getTenantDbFromContext(),
    ): Promise<AdminMobileOverview> {
        const sections = await this.getModuleSections(context, tenantDb);
        const shortcuts = context.availablePortals.flatMap((portal) => {
            const href = shortcutHref(portal);
            return href ? [{ id: portal.id, label: portal.title, href }] : [];
        });

        return {
            ...sections,
            highlights: buildHighlights(
                sections.modules,
                sections.counts.total,
            ).slice(0, 4),
            shortcuts,
        };
    }
}
