import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Bell, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { prisma } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';
import { hasAnyRole } from '@/lib/auth/roles';
import { HR_ALERT_TYPES } from '@/lib/hrd/employment-reminder';
import { ScanRemindersButton } from '@/components/hrd/ScanRemindersButton';
import {
    MarkAlertReadButton,
    MarkAllAlertsReadButton,
} from '@/components/hrd/HrAlertActions';

const PAGE_SIZE = 20;
const BASE_PATH = '/hrd/alerts';

function parsePage(value: string | undefined): number {
    const page = Number.parseInt(value ?? '', 10);
    return Number.isInteger(page) && page >= 1 ? page : 1;
}

function alertsHref(unreadOnly: boolean, page: number): string {
    const query = new URLSearchParams();
    if (unreadOnly) query.set('unread', 'true');
    if (page > 1) query.set('page', String(page));
    const qs = query.toString();
    return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
}

const getHrdAlerts = withTenantPage(
    async (userId: string, unreadOnly: boolean, requestedPage: number) => {
        const where = {
            userId,
            type: { in: HR_ALERT_TYPES },
            ...(unreadOnly ? { isRead: false } : {}),
        };
        const [total, unreadTotal] = await Promise.all([
            prisma.notification.count({ where }),
            prisma.notification.count({
                where: { userId, type: { in: HR_ALERT_TYPES }, isRead: false },
            }),
        ]);
        const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const page = Math.min(requestedPage, lastPage);
        const items = await prisma.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
        });
        return { items, total, unreadTotal, page, lastPage };
    },
);

function FilterTabs({ unreadOnly }: { unreadOnly: boolean }) {
    const tab = (active: boolean) =>
        `px-3 py-1.5 rounded-full text-xs font-medium border ${
            active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground hover:bg-muted/50'
        }`;
    return (
        <div className="flex gap-2">
            <Link href={BASE_PATH} className={tab(!unreadOnly)}>
                Semua
            </Link>
            <Link
                href={`${BASE_PATH}?unread=true`}
                className={tab(unreadOnly)}
            >
                Belum dibaca
            </Link>
        </div>
    );
}

function Pager(props: {
    unreadOnly: boolean;
    page: number;
    lastPage: number;
    total: number;
    shown: number;
}) {
    const { unreadOnly, page, lastPage, total, shown } = props;
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = (page - 1) * PAGE_SIZE + shown;
    const linkClass = 'text-xs text-primary hover:underline';
    return (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
                {total === 0 ? '0 peringatan' : `${from}–${to} dari ${total}`}
            </span>
            <div className="flex gap-4">
                {page > 1 && (
                    <Link
                        href={alertsHref(unreadOnly, page - 1)}
                        className={linkClass}
                    >
                        Sebelumnya
                    </Link>
                )}
                {page < lastPage && (
                    <Link
                        href={alertsHref(unreadOnly, page + 1)}
                        className={linkClass}
                    >
                        Berikutnya
                    </Link>
                )}
            </div>
        </div>
    );
}

export default async function AlertsPage({
    searchParams,
}: {
    searchParams: Promise<{ unread?: string; page?: string }>;
}) {
    const params = await searchParams;
    const session = await auth();
    if (!session) redirect('/login');
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE', 'HRD']))
        redirect('/dashboard');

    const unreadOnly = params.unread === 'true';
    const canScan = hasAnyRole(session.user, ['ADMIN', 'HRD']);
    const { items, total, unreadTotal, page, lastPage } = await getHrdAlerts(
        session.user.id,
        unreadOnly,
        parsePage(params.page),
    );

    const fmt = (d: Date) => format(d, 'dd MMM yyyy, HH:mm', { locale: id });

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight uppercase">
                            Peringatan HR
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Kontrak &amp; probation yang habis segera
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {unreadTotal > 0 && <MarkAllAlertsReadButton />}
                    {canScan && <ScanRemindersButton />}
                </div>
            </div>

            <FilterTabs unreadOnly={unreadOnly} />

            {items.length === 0 ? (
                <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Tidak ada peringatan saat ini.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((n) => (
                        <div
                            key={n.id}
                            id={`alert-${n.id}`}
                            tabIndex={-1}
                            className="bg-card rounded-xl border p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors target:ring-2 target:ring-primary focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <Bell className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">
                                        {n.title}
                                    </span>
                                    {!n.isRead && (
                                        <span
                                            className="h-2 w-2 rounded-full bg-primary shrink-0"
                                            aria-label="Belum dibaca"
                                        />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {n.message}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    {fmt(n.createdAt)}
                                </p>
                            </div>
                            {!n.isRead && <MarkAlertReadButton id={n.id} />}
                            {n.link && (
                                <Link
                                    href={n.link}
                                    className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                                >
                                    Lihat <ChevronRight className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <Pager
                unreadOnly={unreadOnly}
                page={page}
                lastPage={lastPage}
                total={total}
                shown={items.length}
            />
        </div>
    );
}
