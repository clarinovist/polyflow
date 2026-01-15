'use client';

import { useEffect, useState, useTransition } from "react";
import { KioskOrderCard } from "@/components/production/kiosk/KioskOrderCard";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCcw, X } from "lucide-react";
import { toast } from "sonner";

interface Order {
    id: string;
    orderNumber: string;
    plannedQuantity: number;
    actualQuantity: number | null;
    status: string;
    bom: {
        productVariant: {
            name: string;
            skuCode: string;
        };
    };
    machine?: {
        id: string;
        name: string;
    } | null;
    executions: Array<{
        id: string;
        startTime: Date;
        endTime: Date | null;
    }>;
}

export default function KioskRefreshWrapper({ initialOrders }: { initialOrders: Order[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [timeLeft, setTimeLeft] = useState(30);
    const [isPending, startTransition] = useTransition();

    // Barcode Listener
    useBarcodeScanner((code) => {
        console.log("Scanned:", code);
        toast.info(`Scanned: ${code}`);
        const params = new URLSearchParams(searchParams);
        params.set('q', code);
        router.replace(`${pathname}?${params.toString()}`);
    });

    // Auto Refresh Logic
    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 0) {
                    return 30; // Reset
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // Trigger refresh when timer hits 0 (or just reset point)
    useEffect(() => {
        if (timeLeft === 0) {
            startTransition(() => {
                router.refresh();
            });
        }
    }, [timeLeft, router]);

    // Handle Clear Filter
    const clearFilter = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('q');
        router.replace(`${pathname}?${params.toString()}`);
    };

    const hasFilter = searchParams.has('q');

    return (
        <div className="space-y-4">
            {/* Refresh Timer Indicator */}
            <div className="h-1 w-full bg-muted overflow-hidden rounded-full">
                <div
                    className="h-full bg-primary/20 transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
            </div>

            {hasFilter && (
                <div className="flex justify-end">
                    <Button variant="ghost" onClick={clearFilter} className="text-muted-foreground">
                        <X className="mr-2 h-4 w-4" /> Clear Filter
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                {initialOrders.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-muted-foreground bg-muted/20 rounded-lg border-2 border-dashed">
                        {hasFilter ? (
                            <>
                                <p className="text-lg">No orders match filter "{searchParams.get('q')}".</p>
                                <Button variant="link" onClick={clearFilter}>Clear Filter</Button>
                            </>
                        ) : (
                            <>
                                <p className="text-lg">No active jobs assigned.</p>
                                <p className="text-sm">Wait for SPK release.</p>
                            </>
                        )}
                    </div>
                ) : (
                    initialOrders.map(order => (
                        <KioskOrderCard key={order.id} order={order} />
                    ))
                )}
            </div>
        </div>
    );
}
