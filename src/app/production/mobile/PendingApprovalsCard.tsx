import Link from 'next/link';
import { MobileSectionHeader } from '@/components/mobile';
import type {
    ProductionMobilePendingApprovals,
    ProductionMobileSection,
} from '@/services/production/production-mobile-dashboard-service';

const ROW_CLASS =
    'flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm';

function ApprovalRow({
    label,
    section,
    href,
}: {
    label: string;
    section: ProductionMobileSection<{ count: number }>;
    href: string | null;
}) {
    if (section.status !== 'AVAILABLE') {
        return (
            <div
                role="status"
                className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
                {label} tidak tersedia. Nilai tidak diganti dengan nol.
            </div>
        );
    }
    const body = (
        <>
            <span className="font-semibold">{label}</span>
            <span className="flex items-center gap-2">
                <span className="text-base font-bold tabular-nums">
                    {section.data.count}
                </span>
                {href && <span aria-hidden="true">→</span>}
            </span>
        </>
    );
    return href ? (
        <Link href={href} className={ROW_CLASS}>
            {body}
        </Link>
    ) : (
        <div className={ROW_CLASS}>{body}</div>
    );
}

export function PendingApprovalsCard({
    approvals,
}: {
    approvals: ProductionMobilePendingApprovals;
}) {
    return (
        <section className="space-y-2">
            <MobileSectionHeader title="Menunggu persetujuan Anda" />
            <ApprovalRow
                label="Perawatan mesin"
                section={approvals.maintenance}
                href={approvals.links.maintenance}
            />
            <ApprovalRow
                label="Permintaan bahan"
                section={approvals.materialOrders}
                href={approvals.links.materialOrders}
            />
        </section>
    );
}
