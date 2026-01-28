import { PeriodManagementClient } from "@/components/finance/periods/PeriodManagementClient";
import { getFiscalPeriods } from "@/actions/finance/period-actions";
import { auth } from "@/auth";

export default async function PeriodsPage() {
    const session = await auth();
    const currentYear = new Date().getFullYear();
    const periods = await getFiscalPeriods(currentYear);

    return (
        <PeriodManagementClient
            initialPeriods={periods}
            currentYear={currentYear}
            userId={session?.user?.id || 'system'}
        />
    );
}
