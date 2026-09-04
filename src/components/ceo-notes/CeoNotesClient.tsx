'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    approveNote,
    blockNote,
    claimNote,
    commentOnNote,
    discardNote,
    listDraftNotes,
    listMyNotes,
    resolveNote,
} from '@/actions/ceo-notes/note-actions';
import { ceoNotesLabels } from '@/lib/labels';

type NoteStatus =
    | 'DRAFT'
    | 'PUBLISHED'
    | 'CLAIMED'
    | 'BLOCKED'
    | 'RESOLVED'
    | 'DISCARDED';

type NoteComment = {
    id: string;
    authorId: string;
    body: string;
    createdAt: string;
};

type NoteItem = {
    id: string;
    priority: 'CRITICAL' | 'NORMAL';
    status: NoteStatus;
    title: string;
    body: string;
    suggestedSteps: string[];
    occurrences: number;
    createdAt: string;
    dueAt: string | null;
    claimedBy: { id: string; name: string | null; email: string } | null;
    resolvedBy: { id: string; name: string | null; email: string } | null;
    resolutionNote: string | null;
    comments: NoteComment[];
};

interface CeoNotesClientProps {
    initialNotes: NoteItem[];
    initialDrafts: NoteItem[];
    canModerate: boolean;
}

export function CeoNotesClient({
    initialNotes,
    initialDrafts,
    canModerate,
}: CeoNotesClientProps) {
    const [tab, setTab] = useState('active');

    const { data: notes, mutate: mutateNotes } = useSWR(
        ['ceo-notes', tab],
        async () => {
            if (tab === 'draft') {
                const res = await listDraftNotes();
                return res.success && res.data
                    ? (res.data as NoteItem[])
                    : [];
            }
            const statuses =
                tab === 'blocked'
                    ? (['BLOCKED'] as NoteStatus[])
                    : tab === 'done'
                      ? (['RESOLVED', 'DISCARDED'] as NoteStatus[])
                      : (['PUBLISHED', 'CLAIMED'] as NoteStatus[]);
            const res = await listMyNotes({ statuses });
            return res.success && res.data ? (res.data as NoteItem[]) : [];
        },
        {
            fallbackData:
                tab === 'active'
                    ? initialNotes
                    : tab === 'draft'
                      ? initialDrafts
                      : undefined,
        },
    );

    async function run(
        action: Promise<{ success: boolean; error?: string }>,
        okMsg: string,
    ) {
        const res = await action;
        if (!res.success) {
            toast.error(res.error ?? 'Gagal memproses catatan.');
            return;
        }
        toast.success(okMsg);
        mutateNotes();
    }

    return (
        <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
                <TabsTrigger value="active">
                    {ceoNotesLabels.tabs.active}
                </TabsTrigger>
                <TabsTrigger value="blocked">
                    {ceoNotesLabels.tabs.blocked}
                </TabsTrigger>
                <TabsTrigger value="done">
                    {ceoNotesLabels.tabs.done}
                </TabsTrigger>
                {canModerate && (
                    <TabsTrigger value="draft">
                        {ceoNotesLabels.tabs.draft}
                    </TabsTrigger>
                )}
            </TabsList>
            <TabsContent value={tab} className="mt-4">
                {!notes || notes.length === 0 ? (
                    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                        {tab === 'active'
                            ? ceoNotesLabels.empty.active
                            : tab === 'blocked'
                              ? ceoNotesLabels.empty.blocked
                              : tab === 'done'
                                ? ceoNotesLabels.empty.done
                                : ceoNotesLabels.empty.draft}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {notes.map((n) => (
                            <NoteCard
                                key={n.id}
                                note={n}
                                canModerate={canModerate && n.status === 'DRAFT'}
                                onClaim={() =>
                                    run(
                                        claimNote(n.id),
                                        'Catatan diklaim.',
                                    )
                                }
                                onResolve={(v) =>
                                    run(
                                        resolveNote(n.id, v),
                                        'Catatan ditandai selesai.',
                                    )
                                }
                                onBlock={(v) =>
                                    run(
                                        blockNote(n.id, v),
                                        'Kendala dilaporkan ke CEO.',
                                    )
                                }
                                onComment={(v) =>
                                    run(
                                        commentOnNote(n.id, v),
                                        'Komentar terkirim.',
                                    )
                                }
                                onApprove={() =>
                                    run(
                                        approveNote(n.id),
                                        'Draft disetujui & dikirim.',
                                    )
                                }
                                onDiscard={() =>
                                    run(discardNote(n.id), 'Catatan dibuang.')
                                }
                            />
                        ))}
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}

function NoteCard({
    note,
    canModerate,
    onClaim,
    onResolve,
    onBlock,
    onComment,
    onApprove,
    onDiscard,
}: {
    note: NoteItem;
    canModerate: boolean;
    onClaim: () => void;
    onResolve: (v: string) => void;
    onBlock: (v: string) => void;
    onComment: (v: string) => void;
    onApprove: () => void;
    onDiscard: () => void;
}) {
    const [resolveOpen, setResolveOpen] = useState(false);
    const [resolveText, setResolveText] = useState('');
    const [blockOpen, setBlockOpen] = useState(false);
    const [blockText, setBlockText] = useState('');
    const [commentText, setCommentText] = useState('');
    const [showComments, setShowComments] = useState(note.status === 'BLOCKED');

    const open = !['RESOLVED', 'DISCARDED'].includes(note.status);

    return (
        <Card className="p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge
                            variant={
                                note.priority === 'CRITICAL'
                                    ? 'destructive'
                                    : 'secondary'
                            }
                        >
                            {ceoNotesLabels.priority[note.priority]}
                        </Badge>
                        <Badge variant="outline">
                            {ceoNotesLabels.status[note.status]}
                        </Badge>
                        {note.occurrences > 1 && (
                            <Badge variant="outline">
                                Berulang {note.occurrences}x
                            </Badge>
                        )}
                    </div>
                    <p className="mt-1 font-medium">{note.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {note.body}
                    </p>
                    {note.suggestedSteps.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                            {note.suggestedSteps.map((s, i) => (
                                <li key={i}>{s}</li>
                            ))}
                        </ul>
                    )}
                    {note.status === 'CLAIMED' && note.claimedBy && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Dikerjakan oleh{' '}
                            {note.claimedBy.name || note.claimedBy.email}
                        </p>
                    )}
                    {note.status === 'RESOLVED' && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Diselesaikan oleh{' '}
                            {note.resolvedBy?.name ||
                                note.resolvedBy?.email ||
                                'sistem'}
                            {note.resolutionNote && ` — ${note.resolutionNote}`}
                        </p>
                    )}
                    {note.comments.length > 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 px-2 text-xs"
                            onClick={() => setShowComments((v) => !v)}
                        >
                            {showComments ? 'Sembunyikan' : 'Lihat'} diskusi (
                            {note.comments.length})
                        </Button>
                    )}
                    {showComments && note.comments.length > 0 && (
                        <div className="mt-1 space-y-1 rounded-md bg-muted/50 p-2">
                            {note.comments.map((c) => (
                                <p
                                    key={c.id}
                                    className="text-xs text-muted-foreground"
                                >
                                    {c.body}
                                </p>
                            ))}
                        </div>
                    )}
                    {open && (
                        <div className="mt-2 flex gap-2">
                            <Textarea
                                placeholder="Tulis komentar / balasan..."
                                value={commentText}
                                onChange={(e) =>
                                    setCommentText(e.target.value)
                                }
                                className="min-h-9 text-sm"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    onComment(commentText);
                                    setCommentText('');
                                }}
                            >
                                {ceoNotesLabels.actions.comment}
                            </Button>
                        </div>
                    )}
                </div>

                {open && (
                    <div className="flex shrink-0 flex-col gap-2">
                        {note.status === 'PUBLISHED' && (
                            <Button size="sm" onClick={onClaim}>
                                {ceoNotesLabels.actions.claim}
                            </Button>
                        )}
                        <Dialog
                            open={resolveOpen}
                            onOpenChange={setResolveOpen}
                        >
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                    {ceoNotesLabels.actions.resolve}
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Tandai selesai</DialogTitle>
                                </DialogHeader>
                                <Textarea
                                    placeholder="Catatan penyelesaian (opsional)"
                                    value={resolveText}
                                    onChange={(e) =>
                                        setResolveText(e.target.value)
                                    }
                                />
                                <DialogFooter>
                                    <Button
                                        onClick={() => {
                                            onResolve(resolveText);
                                            setResolveOpen(false);
                                            setResolveText('');
                                        }}
                                    >
                                        Tandai Selesai
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="ghost">
                                    {ceoNotesLabels.actions.blocked}
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>
                                        Laporkan kendala
                                    </DialogTitle>
                                </DialogHeader>
                                <Textarea
                                    placeholder="Ceritakan kendalanya supaya CEO bisa membantu..."
                                    value={blockText}
                                    onChange={(e) =>
                                        setBlockText(e.target.value)
                                    }
                                />
                                <DialogFooter>
                                    <Button
                                        onClick={() => {
                                            onBlock(blockText);
                                            setBlockOpen(false);
                                            setBlockText('');
                                        }}
                                    >
                                        Laporkan
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        {canModerate && (
                            <>
                                <Button size="sm" onClick={onApprove}>
                                    {ceoNotesLabels.actions.approve}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={onDiscard}
                                >
                                    {ceoNotesLabels.actions.discard}
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}
