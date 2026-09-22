/** Mirrors the list's compact toolbar and table while server data loads. */
export default function ProductionOrdersLoading() {
    return (
        <div
            className="mx-auto max-w-[1600px] space-y-6 py-2"
            role="status"
            aria-label="Memuat daftar SPK"
        >
            <span className="sr-only">Memuat daftar SPK…</span>
            <div
                className="space-y-3 motion-safe:animate-pulse"
                aria-hidden="true"
            >
                <div className="h-8 w-64 max-w-full rounded bg-muted" />
                <div className="h-4 w-80 max-w-full rounded bg-muted" />
            </div>
            <div
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
                aria-hidden="true"
            >
                {Array.from({ length: 4 }, (_, index) => (
                    <div
                        key={index}
                        className="h-28 rounded-xl border bg-card p-4 motion-safe:animate-pulse"
                    >
                        <div className="h-4 w-24 rounded bg-muted" />
                        <div className="mt-3 h-7 w-16 rounded bg-muted" />
                    </div>
                ))}
            </div>
            <div
                className="overflow-hidden rounded-xl border bg-card"
                aria-hidden="true"
            >
                <div className="space-y-3 border-b p-5">
                    <div className="h-11 w-64 max-w-full rounded bg-muted" />
                    <div className="h-11 rounded bg-muted" />
                    <div className="h-11 rounded bg-muted" />
                </div>
                {Array.from({ length: 6 }, (_, index) => (
                    <div
                        key={index}
                        className="h-24 border-b bg-muted/20 last:border-0 motion-safe:animate-pulse"
                    />
                ))}
            </div>
        </div>
    );
}
