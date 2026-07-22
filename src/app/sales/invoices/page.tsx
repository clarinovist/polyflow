import { getSalesInvoices, getInvoiceStats } from "@/actions/finance/invoices";
import { salesLabels } from "@/lib/labels";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { parseISO, startOfMonth, endOfMonth } from "date-fns";
import { UrlTransactionDateFilter } from "@/components/common/url-transaction-date-filter";
import { SalesInvoicesShell } from "@/components/sales/SalesInvoicesShell";

export default async function SalesInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; status?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultStart = startOfMonth(now);
  const defaultEnd = endOfMonth(now);

  const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
  const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

  const [invoicesRes, statsRes] = await Promise.all([
    getSalesInvoices({ startDate: checkStart, endDate: checkEnd }),
    getInvoiceStats(),
  ]);

  const invoices = invoicesRes.success && invoicesRes.data ? invoicesRes.data : [];
  const stats = statsRes.success && statsRes.data ? statsRes.data : null;
  const periodLabel = `${format(checkStart, "d MMM", { locale: idLocale })} – ${format(checkEnd, "d MMM yyyy", { locale: idLocale })}`;

  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{salesLabels.salesInvoices}</h1>
          <p className="text-muted-foreground">{salesLabels.salesInvoicesDesc} • Periode invoice: {periodLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">Outstanding/piutang = global all-time (belum lunas semua periode), bukan hanya periode ini.</p>
        </div>
        <UrlTransactionDateFilter defaultPreset="this_month" />
      </div>

      <SalesInvoicesShell
        initialInvoices={invoices as never}
        stats={stats as never}
        periodLabel={periodLabel}
        initialStatus={params?.status}
      />
    </div>
  );
}
