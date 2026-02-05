import { getBudgets } from "@/actions/finance/budget-actions";
import { getAccounts } from "@/actions/finance/account-actions";
import { BudgetListClient } from "@/components/finance/budget/BudgetListClient";

export default async function BudgetPage(props: { searchParams: Promise<{ year?: string }> }) {
    const searchParams = await props.searchParams;
    const year = searchParams.year ? parseInt(searchParams.year) : new Date().getFullYear();

    const budgetsRes = await getBudgets(year);
    const accountsRes = await getAccounts();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const budgets = budgetsRes.success ? (budgetsRes.data as any[]) : [];
    const accounts = accountsRes || [];

    return (
        <BudgetListClient
            initialBudgets={budgets}
            accounts={accounts}
            year={year}
        />
    );
}
