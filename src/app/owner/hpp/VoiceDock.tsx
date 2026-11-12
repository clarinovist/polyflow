'use client';

import { parseOwnerHppVoice } from '@/actions/owner-hpp/owner-hpp-voice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { applyVoiceCommands } from '@/lib/owner-hpp/voice-apply';
import {
    VOICE_LIMITS,
    type VoiceCommand,
} from '@/lib/owner-hpp/voice-commands';
import { buildVoiceContext } from '@/lib/owner-hpp/voice-prompt';
import { randomId } from '@/lib/owner-hpp/workspace-edit';
import type { OwnerHppScenario } from '@/lib/owner-hpp/workspace-schema';
import { cn } from '@/lib/utils/utils';
import { Keyboard, Loader2, Mic, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { requestTranscription } from './voice-client';
import { useHoldToRecord } from './useHoldToRecord';
import { VoicePreview } from './VoicePreview';

interface ParsedVoice {
    commands: VoiceCommand[];
    warnings: string[];
}

interface VoiceDockProps {
    scenario: OwnerHppScenario;
    activeStageId: string;
    /** Applies the commands to the workspace; false when it was rejected. */
    onApply: (commands: VoiceCommand[]) => boolean;
}

const PARSE_FAILED = 'Gagal memproses, coba lagi atau ketik manual.';

function joinTranscript(current: string, added: string): string {
    return [current.trim(), added.trim()].filter(Boolean).join(' ');
}

function micLabel(state: string, willCancel: boolean): string {
    if (state === 'transcribing') return 'Mendengarkan…';
    if (state === 'recording') {
        return willCancel
            ? 'Lepas di luar tombol untuk batal'
            : 'Lepas untuk selesai';
    }
    return 'Tahan untuk bicara';
}

/** Floating push-to-talk button plus the editable transcript and preview sheet. */
export function VoiceDock({
    scenario,
    activeStageId,
    onApply,
}: VoiceDockProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [parsed, setParsed] = useState<ParsedVoice | null>(null);
    const [isParsing, setIsParsing] = useState(false);

    const context = useMemo(
        () => buildVoiceContext(scenario, activeStageId),
        [scenario, activeStageId],
    );

    const hold = useHoldToRecord({
        onAudio: async (audio) => {
            const text = await requestTranscription(audio, context);
            setTranscript((current) => joinTranscript(current, text));
            setParsed(null);
            setIsOpen(true);
        },
    });

    // Recomputed on the current scenario so a manual edit never leaves it stale.
    const preview = useMemo(
        () =>
            parsed
                ? applyVoiceCommands(
                      scenario,
                      activeStageId,
                      parsed.commands,
                      randomId,
                  )
                : null,
        [parsed, scenario, activeStageId],
    );

    async function handleProcess() {
        setIsParsing(true);
        try {
            const response = await parseOwnerHppVoice(transcript, context);
            if (!response.success) {
                toast.error(response.error);
                return;
            }
            setParsed(response.data);
        } catch {
            toast.error(PARSE_FAILED);
        } finally {
            setIsParsing(false);
        }
    }

    function handleApply() {
        if (!parsed) return;
        if (!onApply(parsed.commands)) return;
        setParsed(null);
        setTranscript('');
        setIsOpen(false);
    }

    function handleClose() {
        setParsed(null);
        setIsOpen(false);
    }

    const isBusy = hold.state === 'recording' || hold.state === 'transcribing';
    const canProcess =
        transcript.trim().length > 0 &&
        !isParsing &&
        !isBusy &&
        transcript.length <= VOICE_LIMITS.maxTranscriptLength;
    const allWarnings = [
        ...(parsed?.warnings ?? []),
        ...(preview?.warnings ?? []),
    ];

    return (
        <div className="pointer-events-none fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col items-end gap-2 lg:bottom-6">
            {isOpen ? (
                <div
                    role="dialog"
                    aria-label="Perintah suara"
                    className="pointer-events-auto w-full space-y-2 rounded-lg border bg-background p-3 shadow-lg"
                >
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold">
                            Perintah suara
                        </h2>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            aria-label="Tutup perintah suara"
                            onClick={handleClose}
                        >
                            <X />
                        </Button>
                    </div>
                    <Textarea
                        aria-label="Transkrip perintah"
                        value={transcript}
                        maxLength={VOICE_LIMITS.maxTranscriptLength}
                        placeholder="Tahan tombol mikrofon lalu bicara, atau ketik di sini."
                        onChange={(event) => {
                            setTranscript(event.target.value);
                            setParsed(null);
                        }}
                    />
                    {preview ? (
                        <VoicePreview
                            lines={preview.lines}
                            warnings={allWarnings}
                            onApply={handleApply}
                            onDiscard={() => setParsed(null)}
                        />
                    ) : (
                        <Button
                            type="button"
                            className="min-h-11 w-full"
                            onClick={handleProcess}
                            disabled={!canProcess}
                        >
                            {isParsing ? (
                                <Loader2 className="animate-spin" />
                            ) : null}
                            {isParsing ? 'Memproses…' : 'Proses'}
                        </Button>
                    )}
                </div>
            ) : null}

            {hold.message ? (
                <p
                    role="status"
                    className="pointer-events-auto rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
                >
                    {hold.message}
                </p>
            ) : null}
            {hold.state === 'recording' ? (
                <p
                    role="status"
                    className="pointer-events-auto rounded-md bg-destructive px-3 py-1.5 text-xs text-white"
                >
                    Merekam… {hold.secondsLeft} dtk.{' '}
                    {micLabel(hold.state, hold.willCancel)}
                </p>
            ) : null}

            <div className="pointer-events-auto flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 rounded-full bg-background shadow"
                    aria-label="Ketik perintah"
                    onClick={() => setIsOpen((open) => !open)}
                >
                    <Keyboard />
                </Button>
                <button
                    type="button"
                    aria-label={micLabel(hold.state, hold.willCancel)}
                    disabled={
                        hold.state === 'transcribing' ||
                        hold.state === 'unsupported'
                    }
                    className={cn(
                        'flex size-14 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg select-none [-webkit-touch-callout:none] disabled:opacity-60',
                        hold.state === 'recording' &&
                            'scale-110 bg-destructive',
                    )}
                    {...hold.handlers}
                >
                    {hold.state === 'transcribing' ? (
                        <Loader2 className="size-6 animate-spin" />
                    ) : (
                        <Mic className="size-6" />
                    )}
                </button>
            </div>
        </div>
    );
}
