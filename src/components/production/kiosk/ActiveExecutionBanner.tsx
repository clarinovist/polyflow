'use client';

import { Button } from "@/components/ui/button";
import { StopCircle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

    const active = executions[0]; // Assuming one active at a time per operator/machine context

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

    return (
        <div className="fixed bottom-0 left-65 right-0 bg-slate-900 text-white p-4 shadow-2xl border-t border-slate-700 z-50 flex justify-between items-center animate-in slide-in-from-bottom">
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center bg-green-500 rounded-full animate-pulse">
                    <Clock className="h-6 w-6 text-white" />
                </div>
                <div>
                    <p className="font-mono text-xl font-bold">{elapsed}</p>
                    <p className="text-sm text-slate-400">
                        Running: <span className="text-white">{active.productionOrder.bom.productVariant.name}</span>
                    </p>
                </div>
            </div>

            <Button
                variant="destructive"
                size="lg"
                onClick={() => {
                    // Redirect to order detail for proper stop
                    // We need the order ID.
                    toast.info("Please go to order details to stop and record output.");
                }}
            >
                <StopCircle className="mr-2 h-5 w-5" />
                Record Output & Stop
            </Button>
        </div>
    );
}
