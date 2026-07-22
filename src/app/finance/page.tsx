import { getFinanceShiftBoard } from "@/actions/dashboard/finance-dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceDateFilter } from "@/components/finance/finance-date-filter";
import { formatRupiah } from "@/lib/utils/utils";
import {
  AlertTriangle,
  Banknote,
  FileClock,
  Landmark,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  CalendarClock,
  FileText,
  BarChart3,
  History,
  CreditCard,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { startOfMonth, endOfMonth, parseISO, format } from "date-fns";
import { id as localeId } from "date-fns/locale";

export const dynamic = "force-dynamic";

function QueueCard({ title, count, amount, subLabel, href, icon: Icon, tone }: {
  title: string; count: number; amount: number; subLabel: string; href: string; icon: React.ElementType; tone: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className={`shadow-sm hover:shadow-md transition-shadow border-t-4 ${tone} h-full`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{count}</span>
            <span className="text-xs text-muted-foreground">{subLabel}</span>
          </div>
          <div className="text-sm font-medium mt-1 truncate">{formatRupiah(amount)} sisa</div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultStart = startOfMonth(now);
  const defaultEnd = endOfMonth(now);
  const checkStart = params?.startDate ? parseISO(params.startDate) : defaultStart;
  const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

  const boardRes = await getFinanceShiftBoard({ startDate: checkStart, endDate: checkEnd });
  const board = boardRes.success && boardRes.data ? boardRes.data : null;

  // Fallback if board fails to load
  if (!board) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Papan Keuangan"
          description="Antrean kas & akuntansi + snapshot jujur."
        />
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Gagal memuat papan. Coba refresh.</CardContent></Card>
      </div>
    );
  }

  const hasQueues = board.queues.arOverdueCount > 0 || board.queues.apOverdueCount > 0 || board.queues.draftJournals > 0 || board.queues.openBankRecs > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <PageHeader
          title="Papan Keuangan"
          description="Hari ini: tagih piutang jatuh tempo, bayar hutang, post jurnal draft, rekonsiliasi. Snapshot GL di bawah adalah filter periode — bukan sama dengan antrean invoice."
        />
        <div className="flex items-center gap-2 self-start">
          <FinanceDateFilter />
        </div>
      </div>

      {/* Period close strip */}
      {board.period && (
        <Card className={`border-l-4 ${board.period.currentPeriod ? (board.period.daysToMonthEnd !== null && board.period.daysToMonthEnd <= 5 ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20' : 'border-l-emerald-500') : 'border-l-slate-300'}`}>
          <CardContent className="p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4" />
              {board.period.currentPeriod ? (
                <>
                  <span className="font-medium">Periode {board.period.currentPeriod.name}</span>
                  <Badge variant={board.period.currentPeriod.status === 'OPEN' ? 'default' : 'secondary'}>{board.period.currentPeriod.status}</Badge>
                  {board.period.daysToMonthEnd !== null && (
                    <span className="text-muted-foreground">
                      {board.period.daysToMonthEnd === 0 ? 'Tutup hari ini' : `${board.period.daysToMonthEnd} hari lagi tutup bulan`}
                      {' · '}
                      {format(parseISO(board.period.currentPeriod.endDate), 'd MMM yyyy', { locale: localeId })}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Tidak ada periode berjalan untuk hari ini.</span>
              )}
              <span className="hidden md:inline text-muted-foreground">· {board.period.openCount} periode OPEN</span>
              {board.period.reconThisMonth === 0 && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Belum ada rekonsiliasi bulan ini</Badge>
              )}
              {board.period.reconThisMonth > 0 && (
                <span className="hidden md:inline text-[11px] text-emerald-600">· {board.period.reconThisMonth} rekonsiliasi selesai bulan ini</span>
              )}
            </div>
            <Link href="/finance/periods">
              <Button variant="outline" size="sm" className="gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Kelola periode</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Queues — snapshot (NOT period-bound) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Antrean kerja (snapshot, bukan filter periode)</h2>
          {!hasQueues && <span className="text-xs text-emerald-600">Semua antrean bersih ✓</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Piutang/hutang jatuh tempo = dieksekusi di sini (terima bayar / bayar supplier). Modul sales & purchasing membuat draft invoice; finance menyelesaikan pembayaran.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <QueueCard
            title="Piutang jatuh tempo"
            count={board.queues.arOverdueCount}
            amount={board.queues.arOverdueAmount}
            subLabel={`dari ${board.queues.arUnpaidCount} belum lunas`}
            href="/finance/invoices/sales?overdue=true"
            icon={AlertTriangle}
            tone="border-t-red-500 dark:border-t-red-400"
          />
          <QueueCard
            title="Hutang jatuh tempo"
            count={board.queues.apOverdueCount}
            amount={board.queues.apOverdueAmount}
            subLabel={`dari ${board.queues.apUnpaidCount} belum lunas`}
            href="/finance/invoices/purchase?overdue=true"
            icon={Receipt}
            tone="border-t-amber-500 dark:border-t-amber-400"
          />
          <QueueCard
            title="Jurnal draft"
            count={board.queues.draftJournals}
            amount={0}
            subLabel="menunggu posting"
            href="/finance/journals?status=DRAFT"
            icon={FileClock}
            tone="border-t-blue-500 dark:border-t-blue-400"
          />
          <QueueCard
            title="Rekonsiliasi terbuka"
            count={board.queues.openBankRecs}
            amount={0}
            subLabel="DRAFT / In Progress"
            href="/finance/bank-reconciliation"
            icon={Landmark}
            tone="border-t-purple-500 dark:border-t-purple-400"
          />
        </div>
      </div>

      {/* Attention lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Piutang overdue — top 5
            </CardTitle>
            <CardDescription className="text-xs">Tagih sekarang. Filter: dueDate &lt; hari ini &amp; sisa &gt; 0</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.attention.arOverdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada piutang overdue.</p>
            ) : board.attention.arOverdue.map((it) => (
              <Link key={it.id} href={`/finance/invoices/sales/${it.id}`} className="block rounded-md border p-2.5 hover:bg-muted/50 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{it.invoiceNumber}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{it.customerName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold">{formatRupiah(it.remaining)}</div>
                    <div className="text-[10px] text-muted-foreground">{it.dueDate ? format(parseISO(it.dueDate), 'd MMM', { locale: localeId }) : '-'}</div>
                  </div>
                </div>
              </Link>
            ))}
            <Link href="/finance/invoices/sales?overdue=true"><Button variant="ghost" size="sm" className="w-full mt-1 h-8 text-xs">Lihat semua overdue <ArrowUpRight className="h-3 w-3 ml-1" /></Button></Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-600" /> Hutang overdue — top 5
            </CardTitle>
            <CardDescription className="text-xs">Bayar prioritas. Filter: dueDate &lt; hari ini &amp; sisa &gt; 0</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.attention.apOverdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada hutang overdue.</p>
            ) : board.attention.apOverdue.map((it) => (
              <Link key={it.id} href={`/finance/invoices/purchase/${it.id}`} className="block rounded-md border p-2.5 hover:bg-muted/50 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{it.invoiceNumber}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{it.supplierName}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold">{formatRupiah(it.remaining)}</div>
                    <div className="text-[10px] text-muted-foreground">{it.dueDate ? format(parseISO(it.dueDate), 'd MMM', { locale: localeId }) : '-'}</div>
                  </div>
                </div>
              </Link>
            ))}
            <Link href="/finance/invoices/purchase?overdue=true"><Button variant="ghost" size="sm" className="w-full mt-1 h-8 text-xs">Lihat semua overdue <ArrowDownRight className="h-3 w-3 ml-1" /></Button></Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileClock className="h-4 w-4 text-blue-600" /> Jurnal draft — top 5
            </CardTitle>
            <CardDescription className="text-xs">Posting sebelum tutup buku.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {board.attention.draftJournals.length === 0 ? (
              <p className="text-xs text-muted-foreground">Tidak ada jurnal draft.</p>
            ) : board.attention.draftJournals.map((j) => (
              <Link key={j.id} href={`/finance/journals/${j.id}`} className="block rounded-md border p-2.5 hover:bg-muted/50 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{j.entryNumber}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{j.description}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">{format(parseISO(j.entryDate), 'd MMM', { locale: localeId })}</div>
                </div>
              </Link>
            ))}
            <Link href="/finance/journals?status=DRAFT"><Button variant="ghost" size="sm" className="w-full mt-1 h-8 text-xs">Lihat jurnal draft <FileText className="h-3 w-3 ml-1" /></Button></Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions — ID */}
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">Cepat</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance/payments/received"><Button variant="outline" size="sm" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Terima bayar</Button></Link>
          <Link href="/finance/payments/sent"><Button variant="outline" size="sm" className="gap-1.5"><Banknote className="h-3.5 w-3.5" /> Bayar supplier</Button></Link>
          <Link href="/finance/petty-cash"><Button variant="outline" size="sm" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Petty cash</Button></Link>
          <Link href="/finance/journals"><Button variant="outline" size="sm" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Jurnal baru</Button></Link>
          <Link href="/finance/aging"><Button variant="outline" size="sm" className="gap-1.5"><History className="h-3.5 w-3.5" /> Aging</Button></Link>
          <Link href="/finance/bank-reconciliation"><Button variant="outline" size="sm" className="gap-1.5"><Landmark className="h-3.5 w-3.5" /> Rekonsiliasi</Button></Link>
          <Link href="/finance/reports"><Button variant="outline" size="sm" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Laporan</Button></Link>
        </div>
      </div>

      {/* Snapshot periode — honest GL metrics */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Snapshot periode (filter bulan, POSTED GL saja)</h2>
          <Badge variant="outline" className="text-[10px]">{board.snapshot.periodLabel}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Pendapatan periode</CardTitle>
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{formatRupiah(board.snapshot.revenue)}</div>
              <p className="text-[10px] text-muted-foreground mt-1" title={board.snapshot.definitions.revenue}>GL {board.snapshot.definitions.revenue} · Bukan = invoice paid count</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-t-2 border-t-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Posisi kas (akun 111*)</CardTitle>
              <Wallet className="h-3.5 w-3.5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatRupiah(board.snapshot.cashPosition)}</div>
              <p className="text-[10px] text-muted-foreground mt-1" title={board.snapshot.definitions.cash}>GL {board.snapshot.definitions.cash} · Bukan = Revenue − AP</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Piutang GL (112*)</CardTitle>
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{formatRupiah(board.snapshot.arGl)}</div>
              <p className="text-[10px] text-muted-foreground mt-1" title={board.snapshot.definitions.arGl}>GL {board.snapshot.definitions.arGl} · Beda dengan antrean invoice sisa</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Hutang GL (211*)</CardTitle>
              <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{formatRupiah(board.snapshot.apGl)}</div>
              <p className="text-[10px] text-muted-foreground mt-1" title={board.snapshot.definitions.apGl}>GL {board.snapshot.definitions.apGl} · Beda dengan antrean invoice sisa</p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/finance/reports"><Button variant="outline" size="sm" className="h-7 text-xs">→ Laporan</Button></Link>
          <Link href="/finance/aging"><Button variant="outline" size="sm" className="h-7 text-xs">→ Aging</Button></Link>
        </div>
      </div>
    </div>
  );
}
