import { PeriodManagementClient } from "@/components/finance/periods/PeriodManagementClient";
import { getFiscalPeriods } from "@/actions/finance/period-actions";
import { auth } from "@/auth";

export default async function PeriodsPage({
    searchParams
}: {
    searchParams: { year?: string }
}) {
    const session = await auth();
    const currentYear = new Date().getFullYear();
    const selectedYear = searchParams.year ? parseInt(searchParams.year) : currentYear;
    const periods = await getFiscalPeriods(selectedYear);

    return (
        <PeriodManagementClient
            initialPeriods={periods}
            currentYear={selectedYear}
            userId={session?.user?.id || 'system'}
        />
    );
}
