'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { KioskOrderCard } from '@/components/production/kiosk/KioskOrderCard';
import { KioskSegmented } from '@/components/kiosk/ui/KioskSegmented';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KIOSK_OPERATOR_STORAGE_KEY } from '@/components/kiosk/useVerifiedKioskOperator';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { kioskLabels } from '@/lib/labels';
import { filterKioskJobs } from '@/lib/production/kiosk-job-filter';
import { refreshKioskData } from '@/actions/app/refresh-actions';
import type { KioskJobCard } from '@/services/production/kiosk-job-service';

const REFRESH_MS = 30_000;
const CLOCK = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
});

interface Employee {
    id: string;
    name: string;
    machineIds?: string[];
}

interface KioskJobListProps {
    jobs: KioskJobCard[];
    employees: Employee[];
    machines: Array<{ id: string; name: string }>;
}

export default function KioskJobList({
    jobs,
    employees,
    machines,
}: KioskJobListProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [, startTransition] = useTransition();
    const [operatorId, setOperatorId] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [query, setQuery] = useState(searchParams.get('q') ?? '');
    const [machine, setMachine] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

    useEffect(() => {
        setOperatorId(sessionStorage.getItem(KIOSK_OPERATOR_STORAGE_KEY));
        setIsInitialized(true);
    }, []);

    // New server data arrives as new props after each refresh.
    useEffect(() => setUpdatedAt(new Date()), [jobs]);

    useEffect(() => {
        const timer = setInterval(
            () => startTransition(() => router.refresh()),
            REFRESH_MS,
        );
        return () => clearInterval(timer);
    }, [router]);

    useBarcodeScanner((code) => {
        toast.info(`Scan: ${code}`);
        setQuery(code);
    });

    const operator = employees.find((e) => e.id === operatorId);
    const operatorMachineIds = useMemo(
        () => operator?.machineIds ?? [],
        [operator],
    );
    // One assigned machine is the natural default; otherwise show everything.
    const activeMachine =
        machine ??
        (operatorMachineIds.length === 1 ? operatorMachineIds[0] : 'all');

    const machineOptions = useMemo(() => {
        const ids = operatorMachineIds.length
            ? operatorMachineIds
            : [
                  ...new Set(
                      jobs
                          .map((job) => job.machine?.id)
                          .filter((id): id is string => !!id),
                  ),
              ];
        return [
            ...ids.map((id) => ({
                value: id,
                label: machines.find((m) => m.id === id)?.name ?? id,
            })),
            { value: 'all', label: kioskLabels.jobsAllMachines },
            { value: 'manual', label: kioskLabels.jobsManual },
        ];
    }, [operatorMachineIds, jobs, machines]);

    const visible = filterKioskJobs(jobs, {
        query,
        machine: activeMachine,
        operatorMachineIds,
    });

    if (!isInitialized) {
        return (
            <div
                role="status"
                className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-lg text-muted-foreground"
            >
                <Loader2 aria-hidden="true" className="size-8 animate-spin" />
                {kioskLabels.loadingKiosk}
            </div>
        );
    }

    if (!operatorId) {
        return (
            <div className="grid min-h-[60vh] place-content-center justify-items-center gap-4 p-6 text-center">
                <p className="text-lg text-muted-foreground">
                    {kioskLabels.jobsNoOperator}
                </p>
                <Link href="/kiosk" className={kioskButton({ size: 'lg' })}>
                    <ArrowLeft aria-hidden="true" /> {kioskLabels.jobsMenu}
                </Link>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href="/kiosk"
                        aria-label={kioskLabels.jobsMenu}
                        className={kioskButton({ tone: 'ghost' })}
                    >
                        <ArrowLeft aria-hidden="true" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            {kioskLabels.jobList}
                        </h1>
                        <p className="text-base text-muted-foreground">
                            {operator?.name}
                            {updatedAt &&
                                ` · ${kioskLabels.jobsUpdated} ${CLOCK.format(updatedAt)} · ${kioskLabels.jobsAutoRefresh}`}
                        </p>
                    </div>
                </div>
                <form action={refreshKioskData}>
                    <button type="submit" className={kioskButton()}>
                        <RefreshCcw aria-hidden="true" /> {kioskLabels.refresh}
                    </button>
                </form>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-14 flex-1 basis-64 items-center gap-3 rounded-xl border-2 border-border bg-card px-4 focus-within:ring-[3px] focus-within:ring-ring/50">
                    <Search
                        aria-hidden="true"
                        className="size-5 shrink-0 text-muted-foreground"
                    />
                    <input
                        type="search"
                        aria-label={kioskLabels.jobsSearch}
                        placeholder={kioskLabels.jobsSearch}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-12 w-full min-w-0 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
                    />
                </label>
                <KioskSegmented
                    label={kioskLabels.jobsFilterLabel}
                    options={machineOptions}
                    value={activeMachine}
                    onChange={setMachine}
                />
            </div>

            {operatorMachineIds.length === 0 && (
                <div className="rounded-xl bg-kiosk-warn-soft p-4 text-kiosk-warn-ink">
                    <p className="text-lg font-bold">
                        {kioskLabels.jobsNoAssignmentTitle}
                    </p>
                    <p className="text-base">
                        {kioskLabels.jobsNoAssignmentDesc}
                    </p>
                </div>
            )}

            {visible.length === 0 ? (
                <div className="grid justify-items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center text-muted-foreground">
                    <p className="text-xl font-bold">
                        {query
                            ? `${kioskLabels.emptyNoFilterMatch} "${query}"`
                            : operatorMachineIds.length
                              ? kioskLabels.emptyNoJobsForMachine
                              : kioskLabels.emptyNoJobsReady}
                    </p>
                    {query ? (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className={kioskButton()}
                        >
                            {kioskLabels.emptyClearFilter}
                        </button>
                    ) : (
                        <p className="text-lg">
                            {kioskLabels.emptyWaitingRelease}
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid gap-3 pb-24 xl:grid-cols-2">
                    {visible.map((job) => (
                        <KioskOrderCard key={job.id} job={job} />
                    ))}
                </div>
            )}
        </div>
    );
}
