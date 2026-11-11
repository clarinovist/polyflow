'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    markHrAlertRead,
    markHrAlertsAllRead,
} from '@/actions/hrd/employment-reminder';

const READ_ERROR_FALLBACK = 'Gagal menandai peringatan sebagai dibaca.';

type ActionResult = { success: true } | { success: false; error: string };

function useMarkRead(run: () => Promise<ActionResult>) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const handle = () =>
        startTransition(async () => {
            const res = await run();
            if (!res.success) {
                toast.error(res.error || READ_ERROR_FALLBACK);
                return;
            }
            router.refresh();
        });

    return { handle, isPending };
}

export function MarkAlertReadButton({ id }: { id: string }) {
    const { handle, isPending } = useMarkRead(() => markHrAlertRead(id));
    return (
        <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs shrink-0"
            onClick={handle}
            disabled={isPending}
        >
            Tandai dibaca
        </Button>
    );
}

export function MarkAllAlertsReadButton() {
    const { handle, isPending } = useMarkRead(markHrAlertsAllRead);
    return (
        <Button
            size="sm"
            variant="outline"
            onClick={handle}
            disabled={isPending}
        >
            Tandai semua dibaca
        </Button>
    );
}
