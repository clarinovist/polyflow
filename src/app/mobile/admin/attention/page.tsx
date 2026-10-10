import { getAdminMobileOverview } from '@/actions/dashboard/mobile-admin';
import {
    MobileDataFreshness,
    MobileReadError,
    MobileSectionHeader,
} from '@/components/mobile';
import { AdminMobileTaskLink } from '../admin-mobile-task-link';

export default async function AdminAttentionPage() {
    const response = await getAdminMobileOverview();
    if (!response.success) {
        return <MobileReadError title="Antrean perhatian belum tersedia" />;
    }
    const overview = response.data;

    return (
        <div className="space-y-5">
            <MobileSectionHeader title="Perhatian" level={1} className="px-0" />
            <MobileDataFreshness generatedAt={overview.generatedAt} />
            {overview.unavailableModules.length > 0 && (
                <p
                    role="alert"
                    className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                >
                    Sebagian data belum tersedia dan tidak dihitung sebagai nol.
                </p>
            )}
            <p className="text-sm text-muted-foreground">
                Menampilkan {overview.counts.returned} dari{' '}
                {overview.counts.total} kelompok tugas. Persetujuan tetap
                dilakukan di desktop.
            </p>
            <div className="space-y-3">
                {overview.tasks.map((item) => {
                    const content = (
                        <>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-muted-foreground">
                                    {item.module} · {item.priority}
                                </p>
                                <h2 className="mt-1 text-sm font-semibold">
                                    {item.title}
                                </h2>
                            </div>
                            <span className="text-xl font-bold tabular-nums">
                                {item.count}
                            </span>
                        </>
                    );
                    return item.href ? (
                        <AdminMobileTaskLink
                            key={item.id}
                            href={item.href}
                            taskType={item.type}
                            className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4 active:scale-[0.99]"
                        >
                            {content}
                        </AdminMobileTaskLink>
                    ) : (
                        <article
                            key={item.id}
                            className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4"
                        >
                            {content}
                        </article>
                    );
                })}
                {overview.tasks.length === 0 && (
                    <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                        Tidak ada kelompok tugas pada snapshot ini.
                    </p>
                )}
            </div>
        </div>
    );
}
