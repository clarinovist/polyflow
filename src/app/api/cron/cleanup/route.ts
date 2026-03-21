import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'node:crypto';

// This endpoint should be triggered by an external cron service (like Vercel Cron or GitHub Actions)
// or an internal scheduler, passing a secret token to verify authorization.
export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        // A simple bearer token check to prevent unauthorized execution.
        if (process.env.CRON_SECRET) {
            const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
            const providedToken = authHeader || '';

            const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
            const providedHash = crypto.createHash('sha256').update(providedToken).digest();

            if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
                return new NextResponse('Unauthorized', { status: 401 });
            }
        }

        const now = new Date();
        const ninetyDaysAgo = new Date(now.setDate(now.getDate() - 90));
        
        // Let's reset `now` since `getDate() - 90` mutates `now` in place
        const nowRenewed = new Date();
        const thirtyDaysAgo = new Date(nowRenewed.setDate(nowRenewed.getDate() - 30));

        // Delete AuditLogs older than 90 days
        const auditLogCleanup = await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: ninetyDaysAgo
                }
            }
        });

        // Delete Notifications older than 30 days
        const notificationCleanup = await prisma.notification.deleteMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                }
            }
        });

        // Execute Subsystem Notification Triggers
        // These methods will verify states against thresholds and dispatch alerts
        try {
            const { InventoryService } = await import('@/services/inventory-service');
            const { checkOverduePurchasingInvoices } = await import('@/services/purchasing/invoices-service');
            const { InvoiceService } = await import('@/services/invoice-service');
            
            // 1. Trigger Low Stock
            await InventoryService.checkLowStockTriggers();

            // 2. Trigger Overdue AP (Purchasing Invoices)
            await checkOverduePurchasingInvoices();

            // 3. Trigger Overdue AR (Sales Invoices)
            await InvoiceService.checkOverdueSalesInvoices();
        } catch (subErr) {
            console.error('Failed to trigger subsystem notifications during cron: ', subErr);
        }

        return NextResponse.json({
            success: true,
            message: 'Cleanup routine and Alert triggers executed successfully',
            deletedRecords: {
                auditLogs: auditLogCleanup.count,
                notifications: notificationCleanup.count
            },
            executedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error during data cleanup cron:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during cleanup'
        }, { status: 500 });
    }
}
