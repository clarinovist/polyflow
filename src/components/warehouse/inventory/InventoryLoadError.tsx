'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function InventoryLoadError({ message }: { message: string }) {
    const router = useRouter();
    return (
        <div role="alert" className="space-y-3 p-4">
            <p>{message}</p>
            <Button variant="outline" onClick={() => router.refresh()}>
                Coba lagi
            </Button>
        </div>
    );
}
