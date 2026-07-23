'use client';

import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kioskLabels } from "@/lib/labels";

interface ActiveExecutionBannerProps {
    executions: Array<{
        id: string;
        startTime: Date;
        productionOrder: {
            orderNumber: string;
            bom: {
                productVariant: {
                    name: string;
                }
            }
        }
    }>;
}

export function ActiveExecutionBanner({ executions }: ActiveExecutionBannerProps) {
    const [elapsed, setElapsed] = useState<string>("00:00:00");
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
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [active]);

    if (!active) return null;

    const handleNavigateFocus = () => {
        // We need to find the orderId from executions
        // The banner has the productionOrder data, but we need the productionOrderId
        // We'll navigate to jobs list and the user can tap the running job
        router.push('/kiosk/jobs');
    };

    return (
        <div
            className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 shadow-2xl border-t border-slate-700 z-50 flex justify-between items-center animate-in slide-in-from-bottom cursor-pointer hover:bg-slate-800 transition-colors"
            onClick={handleNavigateFocus}
        >
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-green-500 rounded-full animate-pulse shrink-0">
                    <Clock className="h-6 w-6 text-white" />
                </div>
                <div>
                    <p className="font-mono text-xl font-bold">{elapsed}</p>
                    <p className="text-sm text-slate-400">
                        {kioskLabels.running}: <span className="text-white">{active.productionOrder.bom.productVariant.name}</span>
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
                Buka Focus →
            </Button>
        </div>
    );
}
