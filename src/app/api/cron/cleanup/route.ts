import { NextResponse } from 'next/server';
import { getMainPrisma, prisma } from '@/lib/core/prisma';
import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runForEachActiveTenant } from '@/lib/core/tenant-loop';

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

        // Tenant-scoped work: AuditLog, Notification, and business triggers
        const perTenantResults = await runForEachActiveTenant(
            async (tenant) => {
                let auditLogs = 0;
                let notifications = 0;
                let expiredQuotations = 0;
                let autoClosedSchedules: {
                    scanned: number;
                    closed: string[];
                    cancelledTrips: number;
                    cancelledStops: number;
                } | null = null;
                let subsystemError: string | undefined;

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
                    const { InventoryCoreService } = await import(
                        '@/services/inventory/core-service'
                    );
                    const { checkOverduePurchasingInvoices } = await import(
                        '@/services/purchasing/invoices-service'
                    );
                    const { InvoiceService } = await import(
                        '@/services/finance/invoice-service'
                    );

                    await InventoryCoreService.checkLowStockTriggers();
                    await checkOverduePurchasingInvoices();
                    await InvoiceService.checkOverdueSalesInvoices();

                    const { dispatchReminders } = await import(
                        '@/lib/hrd/employment-reminder'
                    );
                    await dispatchReminders(prisma);
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
                    const { autoExpireQuotations } = await import(
                        '@/services/sales/orders-service'
                    );
                    expiredQuotations = await autoExpireQuotations();
                    if (expiredQuotations > 0) {
                        console.log(
                            `[Cron] Auto-expired ${expiredQuotations} quotation(s) for ${tenant.subdomain}.`,
                        );
                    }
                } catch (expireErr) {
                    console.error(
                        `[Cron] Failed to auto-expire quotations for ${tenant.subdomain}:`,
                        expireErr,
                    );
                }

                try {
                    const { autoCloseExpiredDeliverySchedules } =
                        await import(
                            '@/services/sales/delivery-schedule-auto-close'
                        );
                    autoClosedSchedules =
                        await autoCloseExpiredDeliverySchedules({
                            bufferDays: 2,
                        });
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
                    autoClosedSchedules,
                    subsystemError,
                };
            },
        );

        return NextResponse.json({
            success: true,
            usageEventCleanup: { count: usageEventCleanup.count },
            perTenant: perTenantResults,
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
