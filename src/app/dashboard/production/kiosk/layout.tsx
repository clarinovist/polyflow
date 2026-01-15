import { getActiveExecutions } from "@/actions/production";
import { ActiveExecutionBanner } from "@/components/production/kiosk/ActiveExecutionBanner";

export default async function KioskLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const activeExecutions = await getActiveExecutions();

    return (
        <div className="relative min-h-screen">
            {children}
            {activeExecutions.length > 0 && (
                <ActiveExecutionBanner executions={activeExecutions as any} />
            )}
        </div>
    );
}
