import { PrismaClient } from '@prisma/client';
import { getActorUserId } from '@/lib/core/actor-context';

const SYSTEM_USER_ID = 'system';
const AUDITABLE_MODELS = new Set([
    'SalesOrder',
    'ProductionOrder',
    'DeliveryOrder',
    'PurchaseOrder',
    'PurchaseRequest',
    'PurchaseInvoice',
    'Invoice',
    'StockReservation',
    'SalesQuotation',
    'SalesReturn',
    'PurchaseReturn',
    'StockOpname',
    'Machine',
    'Vehicle',
    'LeaveRequest',
    'EmployeeDocument',
    'EmployeeLoan',
    'Employee',
    'PayrollPeriod',
    'Payslip',
    'DeliverySchedule',
    'DeliveryScheduleOrder',
    'DeliveryScheduleVehicle',
    'BankReconciliation',
    'JournalEntry',
    'MaterialIssue',
    'ProductionExecution',
    'ProductionIssue',
    'PettyCashTransaction',
    'PettyCashDailyReport',
    'FiscalPeriod',
    'FixedAsset',
    'Batch',
    'AttendanceRecord',
    'HelpArticle',
    'HelpQuestionCluster',
    'HelpLearningDraft',
    'Tenant',
    'ProcessPieceRate',
    'WorkShift',
    'MaklonMaterialReturn',
]);

type QueryArgs = {
    data?: Record<string, unknown>;
    where?: Record<string, unknown>;
    [key: string]: unknown;
};

function hasStatusField(data: unknown): data is Record<string, unknown> {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return 'status' in obj && obj.status !== undefined;
}

/**
 * Prisma Client Extension that auto-logs status changes to AuditLog.
 *
 * Intercepts update/updateMany calls on all models where `data.status` is present.
 * Reads the old status before the update, compares with new, and inserts an
 * AuditLog row if the value changed.
 *
 * - Skips AuditLog model to prevent infinite recursion.
 * - Skips models not in AUDITABLE_MODELS set (e.g. Session, Account).
 * - Falls back to SYSTEM_USER_ID if no actor in context.
 * - Only fires extra read query when `data.status` is actually present.
 */
export function withStatusAudit<T extends PrismaClient>(client: T): T {
    return client.$extends({
        query: {
            $allModels: {
                async update({
                    model,
                    args,
                    query,
                }: {
                    model: string;
                    args: QueryArgs;
                    query: (args: QueryArgs) => Promise<unknown>;
                }) {
                    if (model === 'AuditLog' || !AUDITABLE_MODELS.has(model)) {
                        return query(args);
                    }

                    if (!hasStatusField(args.data)) {
                        return query(args);
                    }

                    const newStatus = args.data.status as string;

                    // Pre-read old status
                    const delegate = (
                        client as unknown as Record<
                            string,
                            {
                                findFirst: (
                                    args: QueryArgs,
                                ) => Promise<Record<string, unknown> | null>;
                            }
                        >
                    )[model.charAt(0).toLowerCase() + model.slice(1)];
                    if (!delegate) return query(args);

                    const oldRecord = await delegate.findFirst({
                        where: args.where,
                        select: { id: true, status: true },
                    });

                    const result = await query(args);

                    if (oldRecord && oldRecord.status !== newStatus) {
                        const userId = getActorUserId() ?? SYSTEM_USER_ID;
                        try {
                            await (
                                client as unknown as PrismaClient
                            ).auditLog.create({
                                data: {
                                    userId,
                                    action: 'STATUS_CHANGE',
                                    entityType: model,
                                    entityId: oldRecord.id as string,
                                    details: `${model} ${oldRecord.id}: ${oldRecord.status} → ${newStatus}`,
                                    fromStatus: oldRecord.status as string,
                                    toStatus: newStatus,
                                    changes: JSON.stringify({
                                        status: {
                                            from: oldRecord.status,
                                            to: newStatus,
                                        },
                                    }),
                                },
                            });
                        } catch (err) {
                            // Audit failure must not break the business operation
                            console.error(
                                `[StatusAudit] Failed to log status change for ${model} ${oldRecord.id}:`,
                                err,
                            );
                        }
                    }

                    return result;
                },

                async updateMany({
                    model,
                    args,
                    query,
                }: {
                    model: string;
                    args: QueryArgs;
                    query: (args: QueryArgs) => Promise<unknown>;
                }) {
                    if (model === 'AuditLog' || !AUDITABLE_MODELS.has(model)) {
                        return query(args);
                    }

                    if (!hasStatusField(args.data)) {
                        return query(args);
                    }

                    const newStatus = args.data.status as string;
                    const userId = getActorUserId() ?? SYSTEM_USER_ID;

                    // Pre-read old records (capped to prevent runaway reads)
                    const delegate = (
                        client as unknown as Record<
                            string,
                            {
                                findMany: (
                                    args: QueryArgs,
                                ) => Promise<Array<Record<string, unknown>>>;
                            }
                        >
                    )[model.charAt(0).toLowerCase() + model.slice(1)];
                    if (!delegate) return query(args);

                    const oldRecords = await delegate.findMany({
                        where: args.where,
                        select: { id: true, status: true },
                        take: 500,
                    });

                    const result = await query(args);

                    // Log only records whose status actually changed
                    const changed = oldRecords.filter(
                        (r) => r.status !== newStatus,
                    );
                    for (const rec of changed) {
                        try {
                            await (
                                client as unknown as PrismaClient
                            ).auditLog.create({
                                data: {
                                    userId,
                                    action: 'STATUS_CHANGE',
                                    entityType: model,
                                    entityId: rec.id as string,
                                    details: `${model} ${rec.id}: ${rec.status} → ${newStatus}`,
                                    fromStatus: rec.status as string,
                                    toStatus: newStatus,
                                    changes: JSON.stringify({
                                        status: {
                                            from: rec.status,
                                            to: newStatus,
                                        },
                                    }),
                                },
                            });
                        } catch (err) {
                            console.error(
                                `[StatusAudit] Failed to log status change for ${model} ${rec.id}:`,
                                err,
                            );
                        }
                    }

                    return result;
                },
            },
        },
    }) as unknown as T;
}
