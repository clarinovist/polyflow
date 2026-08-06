import { PageHeader } from '@/components/ui/page-header';
import { CollectionDashboardClient } from './CollectionDashboardClient';
import { serializeData } from '@/lib/utils/utils';
import {
    getSalesArAgingAction,
    getMyOverduePromisesAction,
    getInvoicesWithoutCollectionActivityAction,
    listRemittancesAction,
} from '@/actions/sales/collection';
import { getSalesTeamAction } from '@/actions/sales/sales-team';
import { getSalesInvoices } from '@/actions/finance/invoices';
import { getPaymentBanks } from '@/actions/finance/payment-banks-actions';

export default async function SalesCollectionPage() {
    const [
        agingRes,
        overdueRes,
        noActivityRes,
        teamRes,
        remittanceRes,
        invoicesRes,
        paymentBanksRes,
    ] = await Promise.all([
        getSalesArAgingAction({}),
        getMyOverduePromisesAction(),
        getInvoicesWithoutCollectionActivityAction({}),
        getSalesTeamAction().catch(() => null),
        listRemittancesAction({}).catch(() => null),
        getSalesInvoices().catch(() => null),
        getPaymentBanks().catch(() => null),
    ]);

    type ActionRes<T = unknown> = { success?: boolean; data?: T };
    const aging =
        (agingRes as ActionRes)?.success && (agingRes as ActionRes).data
            ? serializeData((agingRes as ActionRes).data)
            : [];
    const overdue =
        (overdueRes as ActionRes)?.success && (overdueRes as ActionRes).data
            ? serializeData((overdueRes as ActionRes).data)
            : [];
    const noActivity =
        (noActivityRes as ActionRes)?.success &&
        (noActivityRes as ActionRes).data
            ? serializeData((noActivityRes as ActionRes).data)
            : [];
    const teamRaw = teamRes as ActionRes | null;
    const team =
        teamRaw?.success && teamRaw.data ? serializeData(teamRaw.data) : [];

    const remittanceRaw = remittanceRes as ActionRes | null;
    const remittances =
        remittanceRaw?.success && remittanceRaw.data
            ? serializeData(remittanceRaw.data)
            : [];

    const invoicesRaw = invoicesRes as ActionRes<
        Array<{
            id: string;
            invoiceNumber: string;
            totalAmount: unknown;
            paidAmount: unknown;
            salesOrder: {
                orderNumber: string;
                customer: { name: string } | null;
            } | null;
        }>
    > | null;
    const allInvoices = invoicesRaw?.success ? (invoicesRaw.data ?? []) : [];
    const unpaidInvoices = allInvoices.filter(
        (inv) => Number(inv.totalAmount) - Number(inv.paidAmount) > 0,
    );

    const paymentBanksRaw = paymentBanksRes as ActionRes | null;
    const paymentBanks =
        paymentBanksRaw?.success && paymentBanksRaw.data
            ? paymentBanksRaw.data
            : {};

    return (
        <div className="space-y-6">
            <PageHeader
                title="Penagihan"
                description="Matriks aging AR per sales, janji bayar jatuh tempo, dan piutang yang belum pernah ditindaklanjuti."
            />
            <CollectionDashboardClient
                initialAging={aging as never}
                initialOverdue={overdue as never}
                initialNoActivity={noActivity as never}
                initialTeam={team as never}
                initialRemittances={remittances as never}
                unpaidInvoices={serializeData(unpaidInvoices) as never}
                paymentBanks={paymentBanks as never}
            />
        </div>
    );
}
