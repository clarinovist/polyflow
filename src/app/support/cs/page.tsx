import { redirect } from 'next/navigation';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';

export default async function SupportCsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;

    const tab = typeof params.tab === 'string' ? params.tab : undefined;
    // Legacy ?tab=howto or ?tab=troubleshoot → canonical routes
    if (tab === 'howto') redirect('/support');
    if (tab === 'troubleshoot') redirect('/support/troubleshooting');

    const q = typeof params.q === 'string' ? params.q.slice(0, 500) : undefined;

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-gradient-to-b from-background via-muted/20 to-background">
            <div className="mx-auto max-w-6xl space-y-6">
                {/* Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/5 p-6 shadow-sm">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1">
                            <span>Bantuan</span>
                            <span>›</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                Tanya Virtual CS
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                            <span>Virtual CS Polyflow</span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Sparkles className="h-3.5 w-3.5" /> AI
                                Workspace
                            </span>
                        </h1>
                        <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
                            Tanyakan panduan penggunaan sistem atau periksa data
                            operasional live pabrik Anda secara instan dan aman.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            <span>Aman & Read-Only</span>
                        </div>
                    </div>
                </div>

                {/* Embedded Chat Panel */}
                <PolyflowChatPanel embedded initialQuestion={q} />
            </div>
        </div>
    );
}
