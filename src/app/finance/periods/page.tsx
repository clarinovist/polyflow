import { PeriodManagementClient } from "@/components/finance/periods/PeriodManagementClient";
import { getFiscalPeriods } from "@/actions/finance/period-actions";

export default async function PeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const resolvedParams = await searchParams;
  const currentYear = new Date().getFullYear();
  const selectedYear = resolvedParams.year
    ? parseInt(resolvedParams.year)
    : currentYear;
  const periodsRes = await getFiscalPeriods(selectedYear);
  const periods = periodsRes.success && periodsRes.data ? periodsRes.data : [];

  return (
    <PeriodManagementClient
      initialPeriods={periods}
      currentYear={selectedYear}
    />
  );
}
