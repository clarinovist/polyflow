import Link from "next/link";
import {
  Clock,
  Wallet,
  Scale,
  CalendarRange,
  HandCoins,
  CalendarDays,
  Gavel,
  AlertTriangle,
  Users,
  ArrowRight,
  Shield,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hrdSidebarLabels } from "@/lib/labels";
import { getHrdDashboardKpis } from "@/actions/hrd/dashboard-kpis";

const hubs = [
  {
    heading: "Kehadiran",
    items: [
      {
        href: "/hrd/attendance",
        icon: Clock,
        title: hrdSidebarLabels.attendance,
        description: "Rekap kehadiran harian, mingguan, dan bulanan",
      },
      {
        href: "/hrd/alerts",
        icon: AlertTriangle,
        title: hrdSidebarLabels.alerts,
        description: "Peringatan kontrak, probation, dan HR",
      },
    ],
  },
  {
    heading: "Penggajian",
    items: [
      {
        href: "/hrd/payroll",
        icon: Wallet,
        title: hrdSidebarLabels.payrollWeekly,
        description: "Hitung dan ekspor gaji borongan mingguan",
      },
      {
        href: "/hrd/payroll-monthly",
        icon: CalendarRange,
        title: hrdSidebarLabels.payrollMonthly,
        description: "Payroll bulanan, BPJS, dan slip gaji",
      },
      {
        href: "/hrd/bpjs",
        icon: Shield,
        title: hrdSidebarLabels.bpjs,
        description: "Peserta BPJS, iuran, dan potongan real",
      },
      {
        href: "/hrd/piece-rates",
        icon: Scale,
        title: hrdSidebarLabels.pieceRates,
        description: "Tarif upah per proses produksi",
      },
      {
        href: "/hrd/loans",
        icon: HandCoins,
        title: hrdSidebarLabels.loans,
        description: "Kasbon dan potongan cicilan karyawan",
      },
    ],
  },
  {
    heading: "Kepegawaian",
    items: [
      {
        href: "/dashboard/employees",
        icon: Users,
        title: hrdSidebarLabels.employees,
        description: "Master data karyawan dan status kerja",
      },
      {
        href: "/hrd/leave",
        icon: CalendarDays,
        title: hrdSidebarLabels.leave,
        description: "Pengajuan cuti dan izin",
      },
      {
        href: "/hrd/disciplinary",
        icon: Gavel,
        title: hrdSidebarLabels.disciplinary,
        description: "Sanksi dan surat peringatan",
      },
    ],
  },
];

function formatIdr(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function HrdDashboardPage() {
  const kpiRes = await getHrdDashboardKpis().catch(() => null);
  const kpi = kpiRes?.success ? kpiRes.data : null;

  return (
    <div className="flex flex-col space-y-8">
      <PageHeader
        title="Portal HRD"
        description="Kelola absensi, penggajian, dan kepegawaian dari satu tempat."
      />

      {kpi && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Link href="/hrd/attendance">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground font-medium">
                  <UserCheck className="h-3.5 w-3.5" /> Hadir hari ini
                </div>
                <div className="text-2xl font-black mt-1">{kpi.presentToday}</div>
                <div className="text-[10px] text-muted-foreground">{kpi.today}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/hrd/leave">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground font-medium">Cuti pending</div>
                <div className="text-2xl font-black mt-1 text-amber-700">{kpi.leavePending}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/hrd/loans">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground font-medium">Kasbon outstanding</div>
                <div className="text-lg font-black mt-1">{formatIdr(kpi.loanOutstanding)}</div>
                <div className="text-[10px] text-muted-foreground">{kpi.loanActiveCount} aktif</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/hrd/payroll-monthly">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground font-medium">Periode gaji OPEN</div>
                <div className="text-2xl font-black mt-1">{kpi.openPayrollPeriods}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/hrd/bpjs">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground font-medium">Peserta BPJS</div>
                <div className="text-2xl font-black mt-1">{kpi.bpjsParticipants}</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/hrd/alerts">
            <Card className="hover:border-rose-300 transition-colors h-full">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase text-muted-foreground font-medium">Alert HR unread</div>
                <div className="text-2xl font-black mt-1 text-rose-700">{kpi.hrAlertsUnread}</div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {hubs.map((group) => (
        <section key={group.heading} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {group.heading}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className="h-full transition-colors hover:border-rose-300 hover:bg-rose-50/40 dark:hover:border-rose-800 dark:hover:bg-rose-950/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-base font-semibold">
                        {item.title}
                      </CardTitle>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
