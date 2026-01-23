import { getActiveExecutions } from "@/actions/production";
import { ActiveExecutionBanner } from "@/components/production/kiosk/ActiveExecutionBanner";
import PolyFlowLogo from "@/components/auth/polyflow-logo";
import { Button } from "@/components/ui/button";
import { Home, Clock } from "lucide-react";
import Link from "next/link";

import { ClockDisplay } from "./ClockDisplay";

interface KioskActiveExecution {
    id: string;
    startTime: Date;
    productionOrder: {
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
    // We allow public access to the kiosk, so we don't redirect to login here.
    // The middleware already handles path protection for other routes.
    // const session = await auth();


    const activeExecutions = (await getActiveExecutions()) as unknown as KioskActiveExecution[];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Kiosk Dedicated Header */}
            <header className="h-20 border-b bg-card px-6 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3 md:gap-8">
                    <PolyFlowLogo size="md" className="md:hidden" />
                    <PolyFlowLogo size="lg" className="hidden md:block" />
                    <div className="h-10 w-px bg-border hidden md:block" />
                    <div className="hidden md:flex flex-col">
                        <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest text-muted-foreground leading-none">
                            Manufacturing Execution
                        </span>
                        <span className="text-lg md:text-xl font-black mt-1 uppercase">OPERATOR KIOSK</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    <div className="bg-muted px-3 md:px-4 py-1.5 md:py-2 rounded-full flex items-center gap-2 md:gap-3 text-xs md:sm font-medium border shadow-sm">
                        <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                        <KioskClock />
                    </div>

                    <div className="h-8 w-px bg-border mx-1 md:mx-2" />

                    <Button variant="outline" size="lg" asChild className="h-10 md:h-12 border-2 hover:bg-accent font-bold px-3 md:px-6">
                        <Link href="/dashboard">
                            <Home className="md:mr-2 h-5 w-5 font-bold" />
                            <span className="hidden md:inline text-xs md:text-base">BACK TO OFFICE</span>
                        </Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-x-hidden">
                {children}
            </main>

            {activeExecutions.length > 0 && (
                <ActiveExecutionBanner executions={activeExecutions} />
            )}
        </div>
    );
}

// Client component for clock to avoid hydration mismatch
function KioskClock() {
    // We'll implement this as a small client component inline or separate
    // For now, let's just make sure it's exported or used correctly
    return <ClockDisplay />;
}


