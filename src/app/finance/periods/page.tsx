import { PeriodManagementClient } from "@/components/finance/periods/PeriodManagementClient";
import { getFiscalPeriods } from "@/actions/finance/period-actions";
import { auth } from "@/auth";

export default async function PeriodsPage({
    searchParams
}: {
    searchParams: Promise<{ year?: string }>
}) {
    const session = await auth();
    const resolvedParams = await searchParams;
    const currentYear = new Date().getFullYear();
    const selectedYear = resolvedParams.year ? parseInt(resolvedParams.year) : currentYear;
    const periods = await getFiscalPeriods(selectedYear);

    return (
        <PeriodManagementClient
            initialPeriods={periods}
            currentYear={selectedYear}
            userId={session?.user?.id || 'system'}
        />
    );
}
