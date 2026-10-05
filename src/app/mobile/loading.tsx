export default function MobileLoading() {
    return (
        <div className="min-h-dvh bg-slate-950 text-slate-50 flex flex-col font-sans">
            <header className="h-14 border-b border-slate-800 bg-slate-900/80 px-4 flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 animate-pulse" />
                <span className="font-bold text-sm tracking-wide text-slate-100">
                    PolyFlow Mobile
                </span>
            </header>
            <main className="flex-1 max-w-md w-full mx-auto p-5 flex flex-col justify-center gap-6">
                <div className="space-y-1.5">
                    <div className="h-7 w-40 rounded-lg bg-slate-800 animate-pulse" />
                    <div className="h-4 w-64 rounded-lg bg-slate-800/70 animate-pulse" />
                </div>
                <div className="space-y-3.5" role="status" aria-label="Memuat portal">
                    <div className="h-20 rounded-xl bg-slate-900/90 border border-slate-800 animate-pulse" />
                    <div className="h-20 rounded-xl bg-slate-900/90 border border-slate-800 animate-pulse" />
                </div>
            </main>
        </div>
    );
}
