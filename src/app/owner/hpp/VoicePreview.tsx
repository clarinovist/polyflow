'use client';

import { Button } from '@/components/ui/button';
import type { VoiceLine } from '@/lib/owner-hpp/voice-apply';
import { Check } from 'lucide-react';

interface VoicePreviewProps {
    lines: VoiceLine[];
    /** Skipped commands and unknown names; never applied. */
    warnings: string[];
    onApply: () => void;
    onDiscard: () => void;
}

/** Plain-language list of what will change, shown before anything is applied. */
export function VoicePreview({
    lines,
    warnings,
    onApply,
    onDiscard,
}: VoicePreviewProps) {
    const hasLines = lines.length > 0;
    return (
        <section aria-label="Pratinjau perubahan" className="space-y-2">
            {hasLines ? (
                <ul className="space-y-1.5">
                    {lines.map((line, index) => (
                        <li
                            key={`${index}-${line.text}`}
                            className="rounded-md border p-2 text-sm"
                        >
                            <p className="font-medium">{line.text}</p>
                            {line.heard ? (
                                <p className="text-xs text-muted-foreground">
                                    Terdengar: &ldquo;{line.heard}&rdquo;
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Tidak ada perubahan yang bisa diterapkan.
                </p>
            )}
            {warnings.length > 0 ? (
                <ul
                    aria-label="Peringatan"
                    className="space-y-1 rounded-md border border-amber-500/50 p-2 text-xs text-amber-700 dark:text-amber-400"
                >
                    {warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                </ul>
            ) : null}
            <div className="flex gap-2">
                <Button
                    type="button"
                    className="min-h-11 flex-1"
                    onClick={onApply}
                    disabled={!hasLines}
                >
                    <Check /> Terapkan
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={onDiscard}
                >
                    Batal
                </Button>
            </div>
        </section>
    );
}
