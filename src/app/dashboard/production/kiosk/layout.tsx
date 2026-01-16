import { getActiveExecutions } from "@/actions/production";
import { ActiveExecutionBanner } from "@/components/production/kiosk/ActiveExecutionBanner";

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
    const activeExecutions = (await getActiveExecutions()) as unknown as KioskActiveExecution[];

    return (
        <div className="relative min-h-screen">
            {children}
            {activeExecutions.length > 0 && (
                <ActiveExecutionBanner executions={activeExecutions} />
            )}
        </div>
    );
}
