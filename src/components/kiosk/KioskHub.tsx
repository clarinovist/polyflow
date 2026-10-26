'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { kioskLabels } from '@/lib/labels';
import { KioskOperatorGate } from '@/components/kiosk/KioskOperatorGate';
import { useVerifiedKioskOperator } from '@/components/kiosk/useVerifiedKioskOperator';
import { KioskTodayStrip } from '@/components/kiosk/KioskTodayStrip';
import { KioskHubMenu } from '@/components/kiosk/KioskHubMenu';
import { KioskLogoutDialog } from '@/components/kiosk/KioskLogoutDialog';
import {
    getOperatorTodaySummary,
    type OperatorTodaySummary,
} from '@/actions/production/production-execution';

interface Employee {
    id: string;
    name: string;
    machineIds?: string[];
    machineNames?: string[];
}

interface KioskHubProps {
    employees: Employee[];
    machines: Array<{ id: string; name: string }>;
    /** Operators with an SPK running right now, for the gate filter. */
    runningOperatorIds?: string[];
    /** Enables the Laporan HD tile and direct link. */
    hasProsesKhusus?: boolean;
}

export function KioskHub({
    employees,
    machines,
    runningOperatorIds = [],
    hasProsesKhusus = false,
}: KioskHubProps) {
    const operator = useVerifiedKioskOperator();
    const operatorId = operator.operatorId;
    const [summary, setSummary] = useState<OperatorTodaySummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

    const fetchSummary = useCallback(async (id: string) => {
        setIsLoadingSummary(true);
        try {
            const res = await getOperatorTodaySummary(id);
            setSummary(
                res.success && res.data
                    ? (res.data as OperatorTodaySummary)
                    : null,
            );
        } catch {
            setSummary(null);
        } finally {
            setIsLoadingSummary(false);
        }
    }, []);

    useEffect(() => {
        if (operatorId) fetchSummary(operatorId);
    }, [operatorId, fetchSummary]);

    const handleConfirmLogout = () => {
        operator.forget();
        setSummary(null);
        setIsLogoutDialogOpen(false);
    };

    if (!operator.isReady) {
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
            <>
                {operator.expired && (
                    <div className="mx-auto w-full max-w-6xl px-4 pt-4 md:px-6">
                        <p
                            role="status"
                            className="rounded-xl bg-kiosk-warn-soft p-4 text-center text-lg font-semibold text-kiosk-warn-ink"
                        >
                            {kioskLabels.sessionExpired}
                        </p>
                    </div>
                )}
                <KioskOperatorGate
                    employees={employees}
                    machines={machines}
                    runningOperatorIds={runningOperatorIds}
                    onSelect={(id, name) => operator.select(id, name)}
                />
            </>
        );
    }

    const currentEmployee = employees.find((e) => e.id === operatorId);
    const operatorName = currentEmployee?.name || '';
    const machineNames =
        currentEmployee?.machineIds
            ?.map((id) => machines.find((m) => m.id === id)?.name)
            .filter((n): n is string => !!n) || [];

    return (
        <>
            <KioskHubMenu
                operatorName={operatorName}
                machineNames={machineNames}
                activeJobs={summary?.activeJobsCount ?? 0}
                hasProsesKhusus={hasProsesKhusus}
                onChangeOperator={() => setIsLogoutDialogOpen(true)}
            >
                <KioskTodayStrip
                    operatorName={operatorName}
                    summary={summary}
                    isLoading={isLoadingSummary}
                />
            </KioskHubMenu>
            <KioskLogoutDialog
                open={isLogoutDialogOpen}
                onOpenChange={setIsLogoutDialogOpen}
                operatorName={operatorName}
                summary={summary}
                onConfirm={handleConfirmLogout}
            />
        </>
    );
}
