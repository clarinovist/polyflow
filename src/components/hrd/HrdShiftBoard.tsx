'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  UserCheck,
  CalendarDays,
  HandCoins,
  CalendarRange,
  Shield,
  AlertTriangle,
  ArrowRight,
  Wallet,
  Clock,
  Users,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';

type BoardData = HrdShiftBoard;

interface HrdShiftBoardProps {
  data: BoardData;
}

function formatIdr(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

function StatCard({
  label,
  count,
  icon: Icon,
  href,
  ctaLabel,
  colorClass,
  subtitle,
}: {
  label: string;
  count: string | number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  ctaLabel: string;
  colorClass: string;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="contents">
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group h-full">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className={cn('p-2 rounded-lg', colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tabular-nums">{count}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
            <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-1 group-hover:underline">
              {ctaLabel} <ArrowRight className="h-3 w-3" />
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AttentionSection({
  title,
  icon: Icon,
  items,
  emptyMessage,
  renderItem,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<Record<string, unknown>>;
  emptyMessage: string;
  renderItem: (item: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-amber-500" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div
              key={String(item.id ?? idx)}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors min-h-[44px]"
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HrdShiftBoardComponent({ data }: HrdShiftBoardProps) {
  const { counts, attention } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hari Ini</h1>
        <p className="text-muted-foreground">
          Ringkasan shift + yang harus diputuskan.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="Hadir hari ini"
          count={counts.presentToday}
          icon={UserCheck}
          href="/hrd/attendance"
          ctaLabel="Rekap"
          colorClass="bg-emerald-500/10 text-emerald-600"
          subtitle={data.today}
        />
        <StatCard
          label="Cuti pending"
          count={counts.leavePending}
          icon={CalendarDays}
          href="/hrd/leave"
          ctaLabel="Proses"
          colorClass="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          label="Kasbon outstanding"
          count={formatIdr(counts.loanOutstanding)}
          icon={HandCoins}
          href="/hrd/loans"
          ctaLabel="Lihat"
          colorClass="bg-rose-500/10 text-rose-600"
          subtitle={`${counts.loanActiveCount} aktif`}
        />
        <StatCard
          label="Periode OPEN"
          count={counts.openPayrollPeriods}
          icon={CalendarRange}
          href="/hrd/payroll-monthly"
          ctaLabel="Proses"
          colorClass="bg-blue-500/10 text-blue-600"
          subtitle={counts.periodsNeedGenerate > 0 ? `${counts.periodsNeedGenerate} perlu generate` : undefined}
        />
        <StatCard
          label="Peserta BPJS"
          count={counts.bpjsParticipants}
          icon={Shield}
          href="/hrd/bpjs"
          ctaLabel="Rekap"
          colorClass="bg-purple-500/10 text-purple-600"
        />
        <StatCard
          label="Alert HR unread"
          count={counts.hrAlertsUnread}
          icon={AlertTriangle}
          href="/hrd/alerts"
          ctaLabel="Tinjau"
          colorClass="bg-orange-500/10 text-orange-600"
        />
      </div>

      {/* Attention Section */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
            Butuh Perhatian
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <AttentionSection
              title="Cuti/izin menunggu"
              icon={CalendarDays}
              items={attention.pendingLeaves.map((l) => ({
                id: l.id,
                employeeName: l.employeeName,
                type: l.type,
                daysPending: l.daysPending,
              }))}
              emptyMessage="Tidak ada cuti pending"
              renderItem={(item) => (
                <Link
                  href={`/hrd/leave`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {String(item.employeeName)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.type)}
                    </span>
                    {typeof item.daysPending === 'number' && item.daysPending > 0 && (
                      <span className="text-xs text-amber-600 ml-2">
                        {item.daysPending} hari
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                </Link>
              )}
            />

            <AttentionSection
              title="Alert kontrak/probation"
              icon={AlertTriangle}
              items={attention.hrAlerts.map((a) => ({
                id: a.id,
                title: a.title,
                type: a.type,
              }))}
              emptyMessage="Tidak ada alert baru"
              renderItem={(item) => (
                <Link
                  href={`/hrd/alerts`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-medium line-clamp-1">
                      {String(item.title)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.type) === 'HRD_PROBATION_ENDING'
                        ? 'Probation'
                        : 'Kontrak'}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                </Link>
              )}
            />

            <AttentionSection
              title="Periode gaji terbuka"
              icon={Wallet}
              items={attention.openPeriods.map((p) => ({
                id: p.id,
                label: p.label,
                status: p.status,
                needsGenerate: p.needsGenerate,
              }))}
              emptyMessage="Semua periode sudah ditutup"
              renderItem={(item) => (
                <Link
                  href={`/hrd/payroll-monthly`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-medium">{String(item.label)}</span>
                    {Boolean(item.needsGenerate) && (
                      <span className="text-xs text-amber-600 ml-2 font-medium">
                        Perlu generate
                      </span>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                </Link>
              )}
            />

            <AttentionSection
              title="Tanpa kabar kemarin"
              icon={UserX}
              items={attention.absentYesterday.map((e) => ({
                id: e.employeeId,
                employeeName: e.employeeName,
                employeeCode: e.employeeCode,
              }))}
              emptyMessage="Semua hadir kemarin"
              renderItem={(item) => (
                <Link
                  href={`/hrd/attendance`}
                  className="flex-1 flex items-center justify-between group/link"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {String(item.employeeName)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {String(item.employeeCode)}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover/link:text-primary transition-colors" />
                </Link>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dual Payroll Guidance */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-2">
            Panduan Gaji
          </h2>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600" />
              <span className="text-muted-foreground">Borongan/harian →</span>
              <Link
                href="/hrd/payroll"
                className="font-semibold text-primary hover:underline"
              >
                Gaji Mingguan
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-blue-600" />
              <span className="text-muted-foreground">Bulanan/kantor →</span>
              <Link
                href="/hrd/payroll-monthly"
                className="font-semibold text-primary hover:underline"
              >
                Gaji Bulanan + BPJS
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">
            Cepat
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/hrd/attendance"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
            >
              <Clock className="h-4 w-4" />
              Rekap Absensi
            </Link>
            <Link
              href="/hrd/payroll"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
            >
              <Wallet className="h-4 w-4" />
              Gaji Mingguan
            </Link>
            <Link
              href="/hrd/payroll-monthly"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
            >
              <CalendarRange className="h-4 w-4" />
              Gaji Bulanan
            </Link>
            <Link
              href="/hrd/employees"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
            >
              <Users className="h-4 w-4" />
              Karyawan
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Compact Menu Links */}
      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide mb-3">
            Semua Menu
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[
              { href: '/hrd/attendance', label: 'Rekap Kehadiran', icon: Clock },
              { href: '/hrd/alerts', label: 'Alert HR', icon: AlertTriangle },
              { href: '/hrd/payroll', label: 'Gaji Mingguan', icon: Wallet },
              { href: '/hrd/payroll-monthly', label: 'Gaji Bulanan', icon: CalendarRange },
              { href: '/hrd/bpjs', label: 'Rekap BPJS', icon: Shield },
              { href: '/hrd/piece-rates', label: 'Tarif Borongan', icon: HandCoins },
              { href: '/hrd/loans', label: 'Kasbon', icon: HandCoins },
              { href: '/hrd/employees', label: 'Karyawan', icon: Users },
              { href: '/hrd/leave', label: 'Cuti & Izin', icon: CalendarDays },
              { href: '/hrd/disciplinary', label: 'Sanksi Disiplin', icon: AlertTriangle },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors text-sm"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
