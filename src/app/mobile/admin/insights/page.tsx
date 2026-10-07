import { getAdminMobileSection } from '@/actions/dashboard/mobile-admin';
import type { AdminMobileModuleKey } from '@/services/dashboard/mobile-admin-service';
import { MobileDataFreshness, MobileInsightCard, MobileReadError, MobileSectionHeader } from '@/components/mobile';

const MODULE_KEYS: readonly AdminMobileModuleKey[] = [
    'PRODUCTION',
    'INVENTORY',
    'PURCHASING',
    'FINANCE',
    'HRD',
];

export default async function AdminInsightsPage() {
    const sections = await Promise.all(
        MODULE_KEYS.map((moduleKey) => getAdminMobileSection(moduleKey)),
    );
    if (sections.every((section) => !section.success)) {
        return <MobileReadError title="Insight admin belum tersedia" />;
    }
    const successful = sections.flatMap((section) =>
        section.success ? [section.data] : [],
    );
    const modules = successful.flatMap((section) => section.modules);
    const unavailableModules = [
        ...sections.flatMap((section) =>
            section.success ? section.data.unavailableModules : [],
        ),
        ...sections.flatMap((section, index) =>
            section.success ? [] : [MODULE_KEYS[index]],
        ),
    ];
    const totalExceptions = modules.reduce(
        (sum, module) => sum + (module.exceptionCount ?? 0),
        0,
    );
    const totalApprovals = modules.reduce(
        (sum, module) => sum + (module.approvalCount ?? 0),
        0,
    );
    const highlights = [
        { key: 'exceptions', label: 'Total pengecualian', value: totalExceptions, severity: totalExceptions > 0 ? 'CRITICAL' as const : 'INFO' as const },
        { key: 'approvals', label: 'Menunggu persetujuan', value: totalApprovals, severity: totalApprovals > 0 ? 'WARNING' as const : 'INFO' as const },
        { key: 'modules', label: 'Modul tersedia', value: unavailableModules.length > 0 ? `${modules.length}/${modules.length + unavailableModules.length}` : modules.length, severity: unavailableModules.length > 0 ? 'WARNING' as const : 'INFO' as const },
    ];
    const generatedAt = successful[0]?.generatedAt ?? new Date().toISOString();

    return (
        <div className="space-y-5">
            <MobileSectionHeader title="Insight" level={1} className="px-0" />
            <MobileDataFreshness generatedAt={generatedAt} />
            <section className="space-y-3">
                <h2 className="text-sm font-semibold">Status modul</h2>
                <div className="grid gap-3">
                    {modules.map((module) => (
                        <article key={module.key} className="rounded-xl border bg-card p-4">
                            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{module.label}</h3><span className="text-xs font-semibold">{module.state === 'AVAILABLE' ? 'Tersedia' : 'Tidak tersedia'}</span></div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><p>Pengecualian<br /><strong className="text-lg tabular-nums">{module.exceptionCount ?? '—'}</strong></p><p>Menunggu persetujuan<br /><strong className="text-lg tabular-nums">{module.approvalCount ?? '—'}</strong></p></div>
                        </article>
                    ))}
                </div>
            </section>
            <section className="space-y-3">
                <h2 className="text-sm font-semibold">Sorotan agregat</h2>
                <div className="grid grid-cols-2 gap-3">{highlights.map((highlight) => <MobileInsightCard key={highlight.key} insight={highlight} />)}</div>
            </section>
        </div>
    );
}
