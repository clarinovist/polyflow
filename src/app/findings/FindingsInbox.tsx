'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { claimFinding, snoozeFinding } from '@/actions/findings/finding-actions';
import { FINDINGS_CHANGED_EVENT } from '@/components/layout/findings-nav-link';
import { summarizeBatch } from '@/lib/findings/batch-outcome';
import type { FindingSection } from '@/lib/findings/finding-groups';
import { FindingGroupCard } from './FindingGroupCard';
import { SnoozeDialog, type SnoozeTarget } from './SnoozeDialog';

type FindingsInboxProps = {
    sections: readonly FindingSection[];
    myUserId: string;
    /** Server render time, so SLA text is identical on server and client. */
    nowIso: string;
};

type BatchAction = (id: string) => Promise<{ success: boolean; error?: string }>;

function reportBatch(
    verb: string,
    outcome: ReturnType<typeof summarizeBatch>,
): void {
    if (outcome.failed === 0) {
        toast.success(`${outcome.ok} temuan ${verb}.`);
        return;
    }
    const detail = outcome.firstError ? ` ${outcome.firstError}` : '';
    if (outcome.ok === 0) {
        toast.error(`Gagal ${verb} ${outcome.failed} temuan.${detail}`);
        return;
    }
    toast.warning(
        `${outcome.ok} temuan ${verb}, ${outcome.failed} gagal.${detail}`,
    );
}

export function FindingsInbox({ sections, myUserId, nowIso }: FindingsInboxProps) {
    const router = useRouter();
    const [isBusy, setIsBusy] = useState(false);
    const [snoozeTarget, setSnoozeTarget] = useState<SnoozeTarget | null>(null);

    async function runBatch(
        ids: readonly string[],
        verb: string,
        action: BatchAction,
    ) {
        setIsBusy(true);
        try {
            const results = await Promise.allSettled(ids.map(action));
            reportBatch(verb, summarizeBatch(results));
        } finally {
            setIsBusy(false);
            window.dispatchEvent(new Event(FINDINGS_CHANGED_EVENT));
            router.refresh();
        }
    }

    const handleClaim = (ids: readonly string[]) =>
        runBatch(ids, 'diklaim', (id) => claimFinding(id));

    async function handleSnooze(days: number, note: string) {
        const target = snoozeTarget;
        if (!target) return;
        setSnoozeTarget(null);
        await runBatch(target.ids, 'ditunda', (id) =>
            snoozeFinding(id, days, note),
        );
    }

    return (
        <div className="space-y-8">
            {sections.map((section) => (
                <section key={section.key} aria-labelledby={`sec-${section.key}`}>
                    <h2
                        id={`sec-${section.key}`}
                        className="mb-3 text-lg font-semibold"
                    >
                        {section.title}{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({section.count})
                        </span>
                    </h2>
                    <div className="space-y-3">
                        {section.groups.map((group) => (
                            <FindingGroupCard
                                key={group.key}
                                group={group}
                                nowIso={nowIso}
                                myUserId={myUserId}
                                isBusy={isBusy}
                                onClaim={handleClaim}
                                onSnooze={(ids, label) =>
                                    setSnoozeTarget({ ids, label })
                                }
                            />
                        ))}
                    </div>
                </section>
            ))}
            <SnoozeDialog
                key={snoozeTarget?.ids.join(',') ?? 'closed'}
                target={snoozeTarget}
                isBusy={isBusy}
                onCancel={() => setSnoozeTarget(null)}
                onConfirm={handleSnooze}
            />
        </div>
    );
}
