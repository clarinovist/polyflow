import { Loader2 } from 'lucide-react';

export default function Loading() {
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex min-h-[60dvh] flex-col items-center justify-center gap-4"
        >
            <Loader2
                aria-hidden="true"
                className="size-12 animate-spin text-muted-foreground"
            />
            <h1 className="text-xl font-semibold text-muted-foreground">
                Memuat kiosk…
            </h1>
        </div>
    );
}
