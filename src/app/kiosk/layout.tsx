import { getActiveExecutions } from "@/actions/production/production";
import { ActiveExecutionBanner } from "@/components/production/kiosk/ActiveExecutionBanner";
import PolyFlowLogo from "@/components/auth/polyflow-logo";
import { Clock } from "lucide-react";

import { ClockDisplay } from "./ClockDisplay";
import { AdminBackButton } from "@/components/layout/admin-back-button";
import { KioskFullscreenToggle } from "./KioskFullscreenToggle";
import { KioskIdleShell } from "./KioskIdleShell";

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
            }
        }
    }
}

export default async function KioskLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const activeExecutions = (await getActiveExecutions()) as unknown as KioskActiveExecution[];

    return (
        <KioskIdleShell>
            <div className="min-h-screen bg-background flex flex-col">
                {/* Kiosk Dedicated Header — decluttered */}
                <header className="h-16 md:h-20 border-b bg-card px-4 md:px-6 flex items-center justify-between sticky top-0 z-50">
                    <div className="flex items-center gap-3 md:gap-6">
                        <a href="/kiosk" className="flex items-center gap-2">
                            <PolyFlowLogo size="md" className="md:hidden" />
                            <PolyFlowLogo size="lg" className="hidden md:block" />
                        </a>
                        <div className="h-8 w-px bg-border hidden md:block" />
                        <div className="hidden md:flex flex-col">
                            <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest text-muted-foreground leading-none">
                                Eksekusi Manufaktur
                            </span>
                            <span className="text-lg md:text-xl font-black mt-1 uppercase">KIOSK</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        <div className="bg-muted px-3 md:px-4 py-1.5 md:py-2 rounded-full flex items-center gap-2 md:gap-3 text-xs md:text-sm font-medium border shadow-sm">
                            <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                            <KioskClock />
                        </div>

                        <KioskFullscreenToggle />

                        <div className="h-8 w-px bg-border mx-1 md:mx-2" />

                        <AdminBackButton />
                    </div>
                </header>

                <main className="flex-1 overflow-x-hidden">
                    {children}
                </main>

                {activeExecutions.length > 0 && (
                    <ActiveExecutionBanner executions={activeExecutions} />
                )}
            </div>
        </KioskIdleShell>
    );
}

function KioskClock() {
    return <ClockDisplay />;
}
