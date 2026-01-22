'use client';

import { useEffect, useState, useTransition } from "react";
import { KioskOrderCard } from "@/components/production/kiosk/KioskOrderCard";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Search, Users, LogIn } from "lucide-react";
import { toast } from "sonner";

export interface Order {
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
    outputLogs?: Array<{
        id: string;
        quantity: number;
        createdAt: string;
    }>;
}

export interface Employee {
    id: string;
    name: string;
}

export interface Machine {
    id: string;
    name: string;
}

export default function KioskRefreshWrapper({ initialOrders, employees, machines }: { initialOrders: Order[], employees: Employee[], machines: Machine[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [timeLeft, setTimeLeft] = useState(30);
    const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
    const [selectedMachineId, setSelectedMachineId] = useState<string | null>("ALL");
    const [isInitialized, setIsInitialized] = useState(false);
    const [_isPending, startTransition] = useTransition();

    // Hydrate operator from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('kiosk_operator_id');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (saved) setSelectedOperatorId(saved);
        setIsInitialized(true);
    }, []);

    // Save operator to localStorage
    useEffect(() => {
        if (selectedOperatorId) {
            localStorage.setItem('kiosk_operator_id', selectedOperatorId);
        } else if (isInitialized) {
            localStorage.removeItem('kiosk_operator_id');
        }
    }, [selectedOperatorId, isInitialized]);

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

    useEffect(() => {
        if (timeLeft === 0) {
            startTransition(() => {
                router.refresh();
            });
        }
    }, [timeLeft, router]);

    const clearFilter = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('q');
        router.replace(`${pathname}?${params.toString()}`);
    };

    const hasFilter = searchParams.has('q');

    if (!selectedOperatorId && isInitialized) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-card rounded-2xl border-4 border-dashed animate-in fade-in zoom-in duration-300">
                <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <Users className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase">Who is operating?</h2>
                <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">Please select your name to start managing production jobs and logging outputs.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
                    {employees.map((emp) => (
                        <Button
                            key={emp.id}
                            variant="outline"
                            size="lg"
                            className="h-24 text-xl font-bold border-2 hover:border-primary hover:bg-primary/5 active:scale-95 transition-all text-left justify-start px-6 gap-4"
                            onClick={() => setSelectedOperatorId(emp.id)}
                        >
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm">
                                {emp.name.charAt(0)}
                            </div>
                            <span className="truncate">{emp.name}</span>
                        </Button>
                    ))}
                </div>

                <p className="mt-12 text-sm text-muted-foreground flex items-center gap-2">
                    <LogIn className="h-4 w-4" /> Selected operator will be saved for this session.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* High-visibility Refresh Timer */}
            <div className="h-2 w-full bg-muted overflow-hidden rounded-full border shadow-inner">
                <div
                    className="h-full bg-primary transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
            </div>

            {/* Header / Active Operator / Logout */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-500/5 p-4 rounded-xl border-2 border-emerald-500/20 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-md uppercase">
                        {employees.find(e => e.id === selectedOperatorId)?.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">Active Operator</span>
                        <span className="text-xl font-black uppercase tracking-tight">{employees.find(e => e.id === selectedOperatorId)?.name}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex-1 md:flex-none flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Filter Machine</span>
                        <select
                            className="h-12 rounded-lg border-2 bg-card px-4 font-bold text-sm focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
                            value={selectedMachineId || "ALL"}
                            onChange={(e) => setSelectedMachineId(e.target.value)}
                        >
                            <option value="ALL">-- ALL MACHINES --</option>
                            {machines.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-transparent select-none">Action</span>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setSelectedOperatorId(null)}
                            className="h-12 font-bold px-4"
                        >
                            LOGOUT
                        </Button>
                    </div>
                </div>
            </div>

            {hasFilter && (
                <div className="flex justify-start">
                    <Button variant="outline" onClick={clearFilter} className="h-10 border-2 text-muted-foreground font-bold text-sm px-4">
                        <Search className="mr-2 h-4 w-4" /> CLEAR SEARCH: {searchParams.get('q')}
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                {initialOrders.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-20 text-muted-foreground bg-muted/20 rounded-2xl border-4 border-dashed">
                        {hasFilter ? (
                            <>
                                <p className="text-2xl font-bold">No jobs match filter &quot;{searchParams.get('q')}&quot;.</p>
                                <Button variant="link" onClick={clearFilter} className="text-xl">Clear Filter</Button>
                            </>
                        ) : (
                            <>
                                <p className="text-2xl font-bold">NO JOBS READY FOR PRODUCTION</p>
                                <p className="text-lg">Waiting for SPK release from PPIC office.</p>
                            </>
                        )}
                    </div>
                ) : (
                    initialOrders
                        .filter(order => selectedMachineId === "ALL" || order.machine?.id === selectedMachineId)
                        .map(order => (
                            <KioskOrderCard
                                key={order.id}
                                order={order}
                                operatorId={selectedOperatorId || undefined}
                            />
                        ))
                )}
            </div>
        </div>
    );
}
