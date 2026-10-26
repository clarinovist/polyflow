'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Search } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { cn } from '@/lib/utils/utils';
import { startKioskOperatorSession } from '@/actions/production/kiosk-operator-session';
import { KioskOperatorPin, PIN_MIN_LENGTH } from './KioskOperatorPin';
import { KioskPill } from './ui/KioskPill';
import { KioskSegmented } from './ui/KioskSegmented';
import { kioskButton } from './ui/kiosk-button';
import { operatorInitials } from './ui/operator-initials';

interface Employee {
    id: string;
    name: string;
    machineIds?: string[];
    machineNames?: string[];
}

interface KioskOperatorGateProps {
    employees: Employee[];
    machines: Array<{ id: string; name: string }>;
    /** Operators with an SPK running right now. */
    runningOperatorIds?: readonly string[];
    /** Called only after the server accepted the operator's PIN. */
    onSelect: (operatorId: string, operatorName: string) => void;
}

type GateFilter = 'all' | 'running';

export function KioskOperatorGate({
    employees,
    machines,
    runningOperatorIds = [],
    onSelect,
}: KioskOperatorGateProps) {
    const [selected, setSelected] = useState<Employee | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<GateFilter>('all');

    const running = useMemo(
        () => new Set(runningOperatorIds),
        [runningOperatorIds],
    );
    const machineLabel = (employee: Employee) =>
        (employee.machineIds ?? [])
            .map((id) => machines.find((machine) => machine.id === id)?.name)
            .filter(Boolean)
            .join(' · ') || kioskLabels.gateNoMachine;
    const needle = query.trim().toLowerCase();
    const visible = employees.filter(
        (employee) =>
            (filter === 'all' || running.has(employee.id)) &&
            employee.name.toLowerCase().includes(needle),
    );
    const runningCount = employees.filter((employee) =>
        running.has(employee.id),
    ).length;

    const choose = (employee: Employee | null) => {
        setSelected(employee);
        setPin('');
        setError('');
    };

    const submitPin = async () => {
        if (!selected || pin.length < PIN_MIN_LENGTH) return;
        setIsSubmitting(true);
        setError('');
        try {
            const result = await startKioskOperatorSession(selected.id, pin);
            if (result.success) {
                onSelect(selected.id, result.data.name);
                return;
            }
            setError(result.error || kioskLabels.pinCheckFailed);
        } catch {
            setError(kioskLabels.pinCheckFailed);
        } finally {
            setIsSubmitting(false);
        }
        setPin('');
    };

    if (selected) {
        return (
            <KioskOperatorPin
                operatorName={selected.name}
                operatorDetail={machineLabel(selected)}
                pin={pin}
                error={error}
                isSubmitting={isSubmitting}
                onPinChange={setPin}
                onSubmit={submitPin}
                onCancel={() => choose(null)}
            />
        );
    }

    return (
        <div className="mx-auto grid w-full max-w-6xl gap-5 p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">
                        {kioskLabels.operatorGateTitle}
                    </h1>
                    <p className="mt-1 text-lg text-muted-foreground">
                        {kioskLabels.operatorGateDesc}
                    </p>
                </div>
                <Link
                    href="/kiosk/attendance"
                    className={kioskButton({ tone: 'info' })}
                >
                    <CalendarCheck aria-hidden="true" />
                    {kioskLabels.gateAttendance} →
                </Link>
            </div>

            {employees.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed p-6 text-lg text-muted-foreground">
                    {kioskLabels.operatorGateEmpty}
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-14 flex-1 basis-64 items-center gap-3 rounded-xl border-2 border-border bg-card px-4 focus-within:ring-[3px] focus-within:ring-ring/50">
                            <Search
                                aria-hidden="true"
                                className="size-5 shrink-0 text-muted-foreground"
                            />
                            <input
                                type="search"
                                aria-label={kioskLabels.gateSearch}
                                placeholder={kioskLabels.gateSearch}
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                className="h-12 w-full min-w-0 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
                            />
                        </label>
                        <KioskSegmented
                            label={kioskLabels.gateFilterLabel}
                            options={[
                                {
                                    value: 'all',
                                    label: `${kioskLabels.gateFilterAll} (${employees.length})`,
                                },
                                {
                                    value: 'running',
                                    label: `${kioskLabels.gateFilterRunning} (${runningCount})`,
                                },
                            ]}
                            value={filter}
                            onChange={setFilter}
                        />
                    </div>

                    {visible.length === 0 ? (
                        <p className="rounded-2xl border-2 border-dashed p-6 text-center text-lg text-muted-foreground">
                            {kioskLabels.gateNoMatch}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {visible.map((employee) => {
                                const isRunning = running.has(employee.id);
                                return (
                                    <button
                                        key={employee.id}
                                        type="button"
                                        onClick={() => choose(employee)}
                                        className={cn(
                                            'flex min-h-20 items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left transition-colors hover:border-primary active:scale-[0.99]',
                                            isRunning
                                                ? 'border-kiosk-go'
                                                : 'border-border',
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold"
                                        >
                                            {operatorInitials(employee.name)}
                                        </span>
                                        <span className="grid min-w-0 gap-1">
                                            <span className="truncate text-lg font-bold">
                                                {employee.name}
                                            </span>
                                            <span className="truncate text-base text-muted-foreground">
                                                {machineLabel(employee)}
                                            </span>
                                            {isRunning && (
                                                <KioskPill
                                                    tone="go"
                                                    live
                                                    className="w-fit"
                                                >
                                                    {kioskLabels.gateRunning}
                                                </KioskPill>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <p className="text-base text-muted-foreground">
                {kioskLabels.operatorGateHint}
            </p>
        </div>
    );
}
