'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ProposalView = {
    id: string;
    summary: string;
    details: { label: string; value: string }[];
    expiresAt: string;
};

type Props = {
    /** Changes whenever the assistant finished a turn, to refetch proposals. */
    refreshKey: unknown;
};

const POLL_MS = 30_000;

async function readError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as {
        error?: string;
    } | null;
    return body?.error ?? fallback;
}

export function AssistantProposalCards({ refreshKey }: Props) {
    const [proposals, setProposals] = useState<ProposalView[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/chat/proposals', {
                cache: 'no-store',
            });
            if (!res.ok) return;
            const body = (await res.json()) as {
                data?: { proposals?: ProposalView[] };
            };
            setProposals(body.data?.proposals ?? []);
        } catch {
            // Silent: the cards are an enhancement and retry on the next poll.
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    useEffect(() => {
        const timer = setInterval(() => void load(), POLL_MS);
        return () => clearInterval(timer);
    }, [load]);

    async function decide(id: string, action: 'confirm' | 'cancel') {
        setBusyId(id);
        setNotice(null);
        try {
            const res = await fetch('/api/chat/proposals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposalId: id, action }),
            });
            if (!res.ok) {
                setNotice(await readError(res, 'Usulan belum dapat diproses.'));
            } else {
                setNotice(
                    action === 'confirm'
                        ? 'Catatan follow-up tersimpan.'
                        : 'Usulan dibatalkan.',
                );
            }
        } catch {
            setNotice('Koneksi bermasalah. Coba lagi.');
        } finally {
            setBusyId(null);
            await load();
        }
    }

    if (proposals.length === 0 && !notice) return null;

    return (
        <div className="max-w-4xl mx-auto mb-3 space-y-2" aria-live="polite">
            {proposals.map((proposal) => (
                <div
                    key={proposal.id}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                >
                    <div className="flex items-start gap-2">
                        <ClipboardCheck
                            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                            aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                            <p className="font-medium">{proposal.summary}</p>
                            <p className="text-xs text-muted-foreground">
                                Menunggu konfirmasi Anda. Belum ada data yang
                                diubah.
                            </p>
                            {proposal.details.length > 0 && (
                                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                                    {proposal.details.map((detail) => (
                                        <div
                                            key={detail.label}
                                            className="contents"
                                        >
                                            <dt className="text-muted-foreground">
                                                {detail.label}
                                            </dt>
                                            <dd className="break-words">
                                                {detail.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            <div className="mt-3 flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={busyId === proposal.id}
                                    onClick={() =>
                                        void decide(proposal.id, 'confirm')
                                    }
                                >
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                    Simpan catatan
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === proposal.id}
                                    onClick={() =>
                                        void decide(proposal.id, 'cancel')
                                    }
                                >
                                    <X className="mr-1 h-3.5 w-3.5" />
                                    Batal
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            {notice && (
                <p role="status" className="text-xs text-muted-foreground">
                    {notice}
                </p>
            )}
        </div>
    );
}
