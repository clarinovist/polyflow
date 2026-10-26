import { getActiveExecutions } from '@/actions/production/production';
import { ActiveExecutionBanner } from '@/components/production/kiosk/ActiveExecutionBanner';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { auth } from '@/auth';
import { kioskLabels } from '@/lib/labels';

import { ClockDisplay } from './ClockDisplay';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { KioskFullscreenToggle } from './KioskFullscreenToggle';
import { KioskIdleShell } from './KioskIdleShell';
import { redirect } from 'next/navigation';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';

interface KioskActiveExecution {
    id: string;
    startTime: Date;
    productionOrderId: string;
    productionOrder: {
        id: string;
        orderNumber: string;
        bom: {
            productVariant: {
                name: string;
            };
        };
    };
}

export default async function KioskLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Kiosk sengaja publik: operator produksi hanya punya Kode Karyawan + PIN,
    // bukan akun ERP. Setiap mutasi tetap diverifikasi PIN per-karyawan di
    // server (AttendanceService.clockIn -> verifyPin) plus rate limit per
    // (IP, kode karyawan). Membuka layout tidak membuka satu pun mutasi.
    // ── Entitlement gate: /kiosk belongs to PRODUCTION module ──
    if (!hasWorkspaceEntitlement('production')) {
        redirect('/error?error=ModuleNotEntitled');
    }

    // getActiveExecutions returns the safeAction envelope, not a bare array.
    const activeResult = await getActiveExecutions();
    const activeExecutions = activeResult.success
        ? (activeResult.data as unknown as KioskActiveExecution[]).map(
              toBannerExecution,
          )
        : [];
    // The kiosk is public; only a signed-in leader gets the way back to the ERP.
    // A failing auth lookup must not take the kiosk down: treat it as signed out.
    const session = await auth().catch(() => null);

    return (
        <KioskIdleShell>
            <div className="min-h-screen bg-background flex flex-col">
                <header className="sticky top-0 z-50 flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 md:min-h-20 md:px-6">
                    <a
                        href="/kiosk"
                        className="flex min-h-12 items-center gap-3"
                    >
                        <PolyFlowLogo size="md" />
                        <span className="hidden text-base font-semibold text-muted-foreground sm:inline">
                            {kioskLabels.shellPlace}
                        </span>
                    </a>

                    <div className="flex items-center gap-2 md:gap-3">
                        <span className="text-xl font-bold tabular-nums">
                            <ClockDisplay />
                        </span>
                        <KioskFullscreenToggle />
                        {session && <AdminBackButton />}
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden">{children}</main>

                {activeExecutions.length > 0 && (
                    <ActiveExecutionBanner executions={activeExecutions} />
                )}
            </div>
        </KioskIdleShell>
    );
}

/**
 * The kiosk is public and the banner is a client component, so every prop
 * lands in the page payload. Copy only the fields the banner shows.
 */
function toBannerExecution(
    execution: KioskActiveExecution,
): KioskActiveExecution {
    return {
        id: execution.id,
        startTime: execution.startTime,
        productionOrderId: execution.productionOrderId,
        productionOrder: {
            id: execution.productionOrder.id,
            orderNumber: execution.productionOrder.orderNumber,
            bom: {
                productVariant: {
                    name:
                        execution.productionOrder.bom?.productVariant?.name ??
                        '',
                },
            },
        },
    };
}
