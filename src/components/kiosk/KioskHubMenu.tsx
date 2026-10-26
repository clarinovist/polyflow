import type { ReactNode } from 'react';
import Link from 'next/link';
import {
    CalendarCheck,
    ClipboardList,
    UserRound,
    Wallet,
    Wrench,
} from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { kioskButton } from './ui/kiosk-button';

type TileTone = 'go' | 'info' | 'neutral';

const ICON_TONE: Record<TileTone, string> = {
    go: 'bg-kiosk-go-soft text-kiosk-go-ink',
    info: 'bg-kiosk-info-soft text-kiosk-info',
    neutral: 'bg-muted text-foreground',
};

const TILE =
    'flex min-h-28 items-center gap-4 rounded-2xl border-2 border-border bg-card p-5';

function TileHead({
    icon,
    tone,
    title,
    description,
}: {
    icon: ReactNode;
    tone: TileTone;
    title: string;
    description: string;
}) {
    return (
        <>
            <span
                aria-hidden="true"
                className={cn(
                    'flex size-14 shrink-0 items-center justify-center rounded-xl [&_svg]:size-7',
                    ICON_TONE[tone],
                )}
            >
                {icon}
            </span>
            <span className="grid min-w-0 gap-1">
                <span className="text-xl font-bold">{title}</span>
                <span className="text-base text-muted-foreground">
                    {description}
                </span>
            </span>
        </>
    );
}

function HubTile({
    href,
    className,
    ...head
}: {
    href: string;
    icon: ReactNode;
    tone: TileTone;
    title: string;
    description: string;
    className?: string;
}) {
    return (
        <Link
            href={href}
            className={cn(
                TILE,
                'transition-colors hover:border-primary active:scale-[0.99]',
                className,
            )}
        >
            <TileHead {...head} />
        </Link>
    );
}

interface KioskHubMenuProps {
    operatorName: string;
    machineNames: string[];
    /** SPKs this operator is running right now. */
    activeJobs: number;
    hasProsesKhusus: boolean;
    onChangeOperator: () => void;
    children?: ReactNode;
}

/** Work menu after the operator's PIN: four tiles of one size and pattern. */
export function KioskHubMenu({
    operatorName,
    machineNames,
    activeJobs,
    hasProsesKhusus,
    onChangeOperator,
    children,
}: KioskHubMenuProps) {
    return (
        <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 pb-8 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-3xl font-extrabold tracking-tight">
                        {kioskLabels.hubGreeting} {operatorName}
                    </h1>
                    <p className="mt-1 text-lg text-muted-foreground">
                        {machineNames.join(' · ') || kioskLabels.gateNoMachine}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onChangeOperator}
                    className={kioskButton({ tone: 'ghost' })}
                >
                    <UserRound aria-hidden="true" />
                    {kioskLabels.sessionLogout}
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <HubTile
                    href="/kiosk/jobs"
                    tone="go"
                    icon={<ClipboardList />}
                    title={kioskLabels.tileProduksi}
                    description={
                        activeJobs > 0
                            ? `${activeJobs} ${kioskLabels.tileProduksiActive}`
                            : kioskLabels.tileProduksiDesc
                    }
                />
                <HubTile
                    href="/kiosk/attendance"
                    tone="info"
                    icon={<CalendarCheck />}
                    title={kioskLabels.tileAbsensi}
                    description={kioskLabels.tileAbsensiDesc}
                />
                {hasProsesKhusus && (
                    <div className={cn(TILE, 'flex-wrap')}>
                        <TileHead
                            tone="neutral"
                            icon={<Wrench />}
                            title={kioskLabels.tileProsesKhusus}
                            description={kioskLabels.tileProsesKhususDesc}
                        />
                        <span className="grid w-full grid-cols-2 gap-2">
                            <Link
                                href="/kiosk/production/hd"
                                className={kioskButton()}
                            >
                                HD
                            </Link>
                            <Link
                                href="/kiosk/production/potongplong"
                                className={kioskButton()}
                            >
                                Potong/Plong
                            </Link>
                        </span>
                    </div>
                )}
                <HubTile
                    href="/my"
                    tone="neutral"
                    icon={<Wallet />}
                    title={kioskLabels.tileStatusSaya}
                    description={kioskLabels.tileStatusSayaDesc}
                    className={hasProsesKhusus ? undefined : 'sm:col-span-2'}
                />
            </div>

            {children}
        </div>
    );
}
