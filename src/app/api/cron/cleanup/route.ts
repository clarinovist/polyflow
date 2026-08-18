import { NextResponse } from 'next/server';
import { getMainPrisma, prisma } from '@/lib/core/prisma';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runForEachActiveTenant } from '@/lib/core/tenant-loop';
import { hasTenantModule } from '@/lib/modules/tenant-entitlements';

export async function GET(req: Request) {
    try {
        const auth = verifyCronAuth(req);
        if (!auth.ok) {
            return new NextResponse(auth.body, { status: auth.status });
        }

        const now = new Date();
        const ninetyDaysAgo = new Date(now.setDate(now.getDate() - 90));
        const nowRenewed = new Date();
        const thirtyDaysAgo = new Date(
            nowRenewed.setDate(nowRenewed.getDate() - 30),
        );

        // UsageEvent cleanup — main DB only (UsageEvent is centrally stored)
        const usageEventCleanup = await getMainPrisma().usageEvent.deleteMany({
            where: { occurredAt: { lt: ninetyDaysAgo } },
        });

        // Module skip events accumulated across the (sequential) tenant loop
        // below — used only for the summary log after the loop completes.
        const moduleSkips: Array<{ tenant: string; module: string }> = [];

        // Tenant-scoped work: AuditLog, Notification, and business triggers
        const perTenantResults = await runForEachActiveTenant(
            async (tenant) => {
                let auditLogs = 0;
                let notifications = 0;
                let expiredQuotations = 0;
                let expiredReservations = 0;
                let autoClosedSchedules: {
                    scanned: number;
                    closed: string[];
                    cancelledTrips: number;
                    cancelledStops: number;
                } | null = null;
                let subsystemError: string | undefined;

                // Resolve once per tenant, not once per subsystem call —
                // hasTenantModule() has no caching of its own.
                const [
                    inventoryEntitled,
                    purchasingEntitled,
                    financeEntitled,
                    hrdEntitled,
                    salesEntitled,
                ] = await Promise.all([
                    hasTenantModule('INVENTORY'),
                    hasTenantModule('PURCHASING'),
                    hasTenantModule('FINANCE'),
                    hasTenantModule('HRD'),
                    hasTenantModule('SALES'),
                ]);

                try {
                    const auditLogCleanup = await prisma.auditLog.deleteMany({
                        where: { createdAt: { lt: ninetyDaysAgo } },
                    });
                    auditLogs = auditLogCleanup.count;
                } catch (err) {
                    console.error(
                        `[Cron] AuditLog cleanup failed for ${tenant.subdomain}:`,
                        err,
                    );
                }

                try {
                    const notificationCleanup =
                        await prisma.notification.deleteMany({
                            where: { createdAt: { lt: thirtyDaysAgo } },
                        });
                    notifications = notificationCleanup.count;
                } catch (err) {
                    console.error(
                        `[Cron] Notification cleanup failed for ${tenant.subdomain}:`,
                        err,
                    );
                }

                try {
                    if (inventoryEntitled) {
                        const { InventoryCoreService } =
                            await import('@/services/inventory/core-service');
                        await InventoryCoreService.checkLowStockTriggers();
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'INVENTORY',
                        });
                    }

                    if (purchasingEntitled) {
                        const { checkOverduePurchasingInvoices } =
                            await import('@/services/purchasing/invoices-service');
                        await checkOverduePurchasingInvoices();
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'PURCHASING',
                        });
                    }

                    if (financeEntitled) {
                        const { InvoiceService } =
                            await import('@/services/finance/invoice-service');
                        await InvoiceService.checkOverdueSalesInvoices();
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'FINANCE',
                        });
                    }

                    if (hrdEntitled) {
                        const { dispatchReminders } =
                            await import('@/lib/hrd/employment-reminder');
                        await dispatchReminders(prisma);
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'HRD',
                        });
                    }
                } catch (subErr) {
                    subsystemError =
                        subErr instanceof Error
                            ? subErr.message
                            : String(subErr);
                    console.error(
                        `[Cron] Subsystem notification triggers failed for ${tenant.subdomain}:`,
                        subErr,
                    );
                }

                try {
                    if (salesEntitled) {
                        const { autoExpireQuotations } =
                            await import('@/services/sales/quotation-service');
                        expiredQuotations = await autoExpireQuotations();
                        if (expiredQuotations > 0) {
                            console.log(
                                `[Cron] Auto-expired ${expiredQuotations} quotation(s) for ${tenant.subdomain}.`,
                            );
                        }
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'SALES',
                        });
                    }
                } catch (expireErr) {
                    console.error(
                        `[Cron] Failed to auto-expire quotations for ${tenant.subdomain}:`,
                        expireErr,
                    );
                }

                try {
                    if (inventoryEntitled) {
                        const { autoExpireReservations } =
                            await import('@/services/inventory/reservation-service');
                        expiredReservations = await autoExpireReservations();
                        if (expiredReservations > 0) {
                            console.log(
                                `[Cron] Auto-expired ${expiredReservations} stock reservation(s) for ${tenant.subdomain}.`,
                            );
                        }
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'INVENTORY',
                        });
                    }
                } catch (expireErr) {
                    console.error(
                        `[Cron] Failed to auto-expire stock reservations for ${tenant.subdomain}:`,
                        expireErr,
                    );
                }

                try {
                    if (salesEntitled) {
                        const { autoCloseExpiredDeliverySchedules } =
                            await import('@/services/sales/delivery-schedule-auto-close');
                        autoClosedSchedules =
                            await autoCloseExpiredDeliverySchedules({
                                bufferDays: 2,
                            });
                    } else {
                        moduleSkips.push({
                            tenant: tenant.subdomain,
                            module: 'SALES',
                        });
                    }
                } catch (closeErr) {
                    console.error(
                        `[Cron] Failed to auto-close delivery schedules for ${tenant.subdomain}:`,
                        closeErr,
                    );
                }

                return {
                    auditLogs,
                    notifications,
                    expiredQuotations,
                    expiredReservations,
                    autoClosedSchedules,
                    subsystemError,
                };
            },
        );

        if (moduleSkips.length > 0) {
            const skipsByModule: Record<string, number> = {};
            for (const s of moduleSkips) {
                skipsByModule[s.module] = (skipsByModule[s.module] ?? 0) + 1;
            }
            console.log('[Cron] Entitlement skip summary:', skipsByModule);
        }

        return NextResponse.json({
            success: true,
            usageEventCleanup: { count: usageEventCleanup.count },
            perTenant: perTenantResults,
            entitlementSkips: moduleSkips.length,
            executedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error during data cleanup cron:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Internal Server Error',
            },
            { status: 500 },
        );
    }
}
