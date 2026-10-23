'use client';

import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { kioskLabels } from '@/lib/labels';

interface ActiveExecutionBannerProps {
    executions: Array<{
        id: string;
        startTime: Date;
        productionOrderId: string;
        productionOrder: {
            id: string;
            orderNumber: string;
            bom: {
                productVariant: {
                    name: string;
                };
            };
        };
    }>;
}

export function ActiveExecutionBanner({
    executions,
}: ActiveExecutionBannerProps) {
    const [elapsed, setElapsed] = useState<string>('00:00:00');
    const router = useRouter();

    const active = executions[0];

    useEffect(() => {
        if (!active) return;

        const interval = setInterval(() => {
            const start = new Date(active.startTime).getTime();
            const now = new Date().getTime();
            const diff = now - start;

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setElapsed(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [active]);

    if (!active) return null;

    const focusOrderId = active.productionOrder.id;
    const handleNavigateFocus = () => {
        router.push(`/kiosk/jobs/${focusOrderId}`);
    };

    return (
        <div
            className="sticky bottom-0 bg-card text-foreground p-4 shadow-lg border-t border-border z-40 flex flex-wrap gap-3 justify-between items-center"
            role="region" aria-label="Eksekusi aktif"
        >
            <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-green-500 rounded-full animate-pulse shrink-0">
                    <Clock className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                    <p className="font-mono text-xl font-bold">{elapsed}</p>
                    <p className="text-sm text-muted-foreground break-words">
                        {kioskLabels.running}:{' '}
                        <span className="text-foreground">
                            {active.productionOrder.bom.productVariant.name}
                        </span>
                    </p>
                </div>
            </div>

            <Button
                variant="secondary"
                size="lg"
                className="shrink-0"
                onClick={(e) => {
                    e.stopPropagation();
                    handleNavigateFocus();
                }}
            >
                Buka SPK →
            </Button>
        </div>
    );
}
