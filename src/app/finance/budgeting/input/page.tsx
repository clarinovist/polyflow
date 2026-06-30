import { getBudgets } from "@/actions/finance/budget-actions";
import { getAccounts } from "@/actions/finance/account-actions";
import { BudgetListClient } from "@/components/finance/budget/BudgetListClient";
import { BudgetingTabs } from "@/components/finance/budget/BudgetingTabs";

export default async function BudgetInputPage(props: {
  searchParams: Promise<{ year?: string }>;
}) {
  const searchParams = await props.searchParams;
  const year = searchParams.year
    ? parseInt(searchParams.year)
    : new Date().getFullYear();

  const budgetsRes = await getBudgets(year);
  const accountsRes = await getAccounts();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const budgets = budgetsRes.success ? (budgetsRes.data as any[]) : [];
  const accounts =
    accountsRes.success && accountsRes.data ? accountsRes.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <BudgetingTabs activeTab="input" />
      <BudgetListClient
        initialBudgets={budgets}
        accounts={accounts}
        year={year}
      />
    </div>
  );
}
