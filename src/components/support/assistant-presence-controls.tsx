'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { useAssistantPresence } from './use-assistant-presence';
type Presence = ReturnType<typeof useAssistantPresence>;

export function AssistantPresenceSettings({
    presence,
}: {
    presence: Presence;
}) {
    return (
        <details className="max-h-52 shrink-0 overflow-y-auto border-b border-border/60 px-4 py-2 text-xs">
            <summary className="cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2">
                Sapaan opsional
            </summary>
            <div className="space-y-2 pb-2">
                <p className="text-muted-foreground">
                    Nonaktif secara default. Maksimal sekali sehari, tanpa suara
                    atau membuka chat. Preferensi disimpan di browser ini.
                </p>
                <label className="flex min-h-11 items-center gap-2">
                    <input
                        type="checkbox"
                        checked={presence.preferences.help}
                        onChange={(event) =>
                            presence.update({
                                ...presence.preferences,
                                help: event.target.checked,
                            })
                        }
                    />
                    Tawarkan panduan halaman
                </label>
                <label className="flex min-h-11 items-center gap-2">
                    <input
                        type="checkbox"
                        checked={presence.preferences.breaks}
                        onChange={(event) =>
                            presence.update({
                                ...presence.preferences,
                                breaks: event.target.checked,
                            })
                        }
                    />
                    Tawarkan jokes ringan setelah 1 jam aktif
                </label>
            </div>
        </details>
    );
}

export function AssistantPresenceOffer({
    presence,
    docked,
}: {
    presence: Presence;
    docked: boolean;
}) {
    if (!presence.offer) return null;
    return (
        <aside
            aria-label="Sapaan Asisten"
            className={
                docked
                    ? 'fixed right-3 top-20 z-30 w-[calc(100vw-1.5rem)] max-w-80 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg'
                    : 'absolute bottom-full right-0 mb-3 w-[calc(100vw-1.5rem)] max-w-80 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg'
            }
        >
            <p className="text-sm font-medium">
                {presence.offer === 'help'
                    ? 'Butuh petunjuk di halaman ini?'
                    : presence.offer === 'break'
                      ? 'Mau selingan sebentar?'
                      : 'Kenapa kalender selalu tenang? Karena semua harinya sudah terjadwal. 🙂'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                {presence.offer === 'help' && presence.guide && (
                    <Button asChild variant="outline" className="min-h-11">
                        <Link href={presence.guide} onClick={presence.dismiss}>
                            Buka panduan
                        </Link>
                    </Button>
                )}
                {presence.offer === 'break' && (
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={presence.showJoke}
                    >
                        Jokes ringan
                    </Button>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={presence.dismiss}
                >
                    {presence.offer === 'joke' ? 'Tutup' : 'Tetap fokus'}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 text-xs"
                    onClick={presence.disable}
                >
                    Jangan tawarkan lagi
                </Button>
            </div>
        </aside>
    );
}
