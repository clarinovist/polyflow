import Link from 'next/link';
import { ArrowRight, Monitor, ShieldCheck } from 'lucide-react';
import { getAdminMobileOverview } from '@/actions/dashboard/mobile-admin';
import {
    MobileDataFreshness,
    MobileInsightCard,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { AdminMobileTaskLink } from './admin-mobile-task-link';

const DESKTOP_AREAS = [
    { label: 'Settings', from: '/dashboard/settings' },
    { label: 'User & permission', from: '/dashboard/settings' },
    { label: 'Master data', from: '/dashboard/products' },
    { label: 'Proses bulk', from: '/dashboard' },
] as const;

export default async function AdminMobilePage() {
    const response = await getAdminMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Ringkasan admin belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm dark:border-sky-900 dark:from-sky-950/40 dark:to-slate-900">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-950 dark:text-white">Hari Ini</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Ringkasan read-only untuk modul yang aktif dan diizinkan.</p>
                    </div>
                </div>
                <MobileDataFreshness generatedAt={overview.generatedAt} className="mt-3" />
            </section>

            {overview.unavailableModules.length > 0 && (
                <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    Sebagian data modul belum tersedia. Nilai tersebut tidak dianggap nol.
                </p>
            )}

            <section className="space-y-3">
                <MobileSectionHeader title="Sorotan" className="px-0" />
                <div className="grid grid-cols-2 gap-3">
                    {overview.highlights.map((highlight) => (
                        <MobileInsightCard key={highlight.key} insight={highlight} />
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <MobileSectionHeader
                    title="Perhatian utama"
                    className="px-0"
                    action={<Link href="/mobile/admin/attention" className="inline-flex min-h-11 items-center text-xs font-semibold text-sky-700">Lihat semua</Link>}
                />
                {overview.tasks.length === 0 ? (
                    <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Tidak ada kelompok pengecualian dari modul yang tersedia.</p>
                ) : (
                    <div className="space-y-3">
                        {overview.tasks.slice(0, 3).map((item) => {
                            const body = (
                                <>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-muted-foreground">{item.module}</p>
                                        <h2 className="mt-1 text-sm font-semibold">{item.title}</h2>
                                    </div>
                                    <span className="text-lg font-bold tabular-nums">{item.count}</span>
                                    {item.href && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                                </>
                            );
                            return item.href ? (
                                <AdminMobileTaskLink
                                    key={item.id}
                                    href={item.href}
                                    taskType={item.type}
                                    className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4 active:scale-[0.99]"
                                >
                                    {body}
                                </AdminMobileTaskLink>
                            ) : (
                                <article key={item.id} className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4">{body}</article>
                            );
                        })}
                    </div>
                )}
                <p className="text-xs text-muted-foreground">Menampilkan {Math.min(overview.tasks.length, 3)} dari {overview.counts.total} kelompok tugas.</p>
            </section>

            {overview.shortcuts.length > 0 && (
                <section className="space-y-3">
                    <MobileSectionHeader title="Portal tersedia" className="px-0" />
                    <div className="grid gap-2 sm:grid-cols-2">
                        {overview.shortcuts.map((shortcut) => (
                            <Link key={shortcut.id} href={shortcut.href} className="flex min-h-11 items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-semibold">
                                {shortcut.label}<ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <section className="space-y-3">
                <MobileSectionHeader title="Perlu desktop" className="px-0" />
                <div className="grid grid-cols-2 gap-3">
                    {DESKTOP_AREAS.map((area) => (
                        <Link key={area.label} href={'/device/desktop-required?from=' + encodeURIComponent(area.from)} className="flex min-h-11 items-center gap-2 rounded-xl border border-dashed bg-slate-100 p-3 text-sm font-medium dark:bg-slate-800/60">
                            <Monitor aria-hidden="true" className="h-4 w-4 shrink-0" />{area.label}
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
