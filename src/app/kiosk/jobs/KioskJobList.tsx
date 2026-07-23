'use client';

import { useEffect, useState, useTransition } from "react";
import { KioskOrderCard } from "@/components/production/kiosk/KioskOrderCard";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Search, RefreshCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { kioskLabels } from "@/lib/labels";
import Link from "next/link";
import { refreshKioskData } from "@/actions/app/refresh-actions";

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
            primaryUnit?: string | null;
            salesUnit?: string | null;
            conversionFactor?: unknown;
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
    machineIds?: string[];
}

export interface Machine {
    id: string;
    name: string;
    operatorIds?: string[];
}

interface KioskJobListProps {
    initialOrders: Order[];
    employees: Employee[];
    machines: Machine[];
}

export default function KioskJobList({ initialOrders, employees, machines }: KioskJobListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [timeLeft, setTimeLeft] = useState(30);
    const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
    const [selectedMachineId, setSelectedMachineId] = useState<string | null>("ALL");
    const [isInitialized, setIsInitialized] = useState(false);
    const [_isPending, startTransition] = useTransition();

    useEffect(() => {
        const saved = sessionStorage.getItem('kiosk_operator_id');
        if (saved) setSelectedOperatorId(saved);
        setIsInitialized(true);
    }, []);

    const defaultMachineId = selectedOperatorId
        ? (() => {
            const operator = employees.find(e => e.id === selectedOperatorId);
            if (operator?.machineIds && operator.machineIds.length === 1) {
                return operator.machineIds[0];
            }
            return "ALL";
        })()
        : "ALL";

    useEffect(() => {
        setSelectedMachineId(defaultMachineId);
    }, [defaultMachineId]);

    useBarcodeScanner((code) => {
        toast.info(`Scanned: ${code}`);
        const params = new URLSearchParams(searchParams);
        params.set('q', code);
        router.replace(`${pathname}?${params.toString()}`);
    });

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 0) return 30;
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

    const searchQuery = searchParams.get('q') || '';

    const hasFilter = searchParams.has('q');

    const operatorMachineIds = selectedOperatorId
        ? employees.find(e => e.id === selectedOperatorId)?.machineIds || []
        : [];

    const getFilteredOrders = () => {
        let filtered = initialOrders;

        if (selectedOperatorId && operatorMachineIds.length > 0) {
            filtered = filtered.filter(order =>
                order.machine && operatorMachineIds.includes(order.machine.id)
            );
        }

        if (selectedMachineId && selectedMachineId !== "ALL") {
            filtered = filtered.filter(order => order.machine?.id === selectedMachineId);
        }

        return filtered;
    };

    const filteredOrders = getFilteredOrders();

    const availableMachines = selectedOperatorId && operatorMachineIds.length > 0
        ? machines.filter(m => operatorMachineIds.includes(m.id))
        : machines;

    if (!isInitialized) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!selectedOperatorId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
                <p className="text-muted-foreground text-lg mb-4">Belum ada operator yang dipilih.</p>
                <Link href="/kiosk">
                    <Button variant="outline" size="lg" className="h-14 text-lg font-bold">
                        <ArrowLeft className="mr-2 h-5 w-5" /> Kembali ke Hub
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Back + Title + Refresh */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-4 md:p-6 rounded-xl border-2 shadow-sm gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/kiosk">
                        <Button variant="ghost" size="icon" className="h-10 w-10" title="Kembali ke Hub">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">{kioskLabels.jobList}</h1>
                        <p className="text-xs md:text-base text-muted-foreground font-medium">{kioskLabels.selectJob}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {searchQuery && (
                        <div className="hidden sm:flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full text-xs md:text-sm font-bold border-2 border-primary/20 text-primary whitespace-nowrap">
                            <Search className="h-4 w-4" />
                            FILTER: {searchQuery}
                        </div>
                    )}
                    <form action={refreshKioskData} className="w-full md:w-auto">
                        <Button variant="secondary" size="lg" className="w-full md:w-auto h-12 md:h-14 md:px-8 text-base md:text-lg font-bold border-2 active:scale-95">
                            <RefreshCcw className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                            {kioskLabels.refresh.toUpperCase()}
                        </Button>
                    </form>
                </div>
            </div>

            {/* Auto-refresh timer */}
            <div className="h-2 w-full bg-muted overflow-hidden rounded-full border shadow-inner">
                <div
                    className="h-full bg-primary transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
            </div>

            {/* Operator info bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-500/5 p-4 rounded-xl border-2 border-emerald-500/20 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-md uppercase">
                        {employees.find(e => e.id === selectedOperatorId)?.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-tight">{kioskLabels.sessionActive}</span>
                        <span className="text-xl font-black uppercase tracking-tight">{employees.find(e => e.id === selectedOperatorId)?.name}</span>
                        {operatorMachineIds.length > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">
                                {operatorMachineIds.map(id => machines.find(m => m.id === id)?.name).filter(Boolean).join(', ')}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex-1 md:flex-none flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Filter Mesin</span>
                        <select
                            className="h-12 rounded-lg border-2 bg-card px-4 font-bold text-sm focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
                            value={selectedMachineId || "ALL"}
                            onChange={(e) => setSelectedMachineId(e.target.value)}
                        >
                            <option value="ALL">-- SEMUA MESIN --</option>
                            {availableMachines.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {hasFilter && (
                <div className="flex justify-start">
                    <Button variant="outline" onClick={clearFilter} className="h-10 border-2 text-muted-foreground font-bold text-sm px-4">
                        <Search className="mr-2 h-4 w-4" /> HAPUS FILTER: {searchParams.get('q')}
                    </Button>
                </div>
            )}

            {/* Operator machine assignment notice */}
            {selectedOperatorId && operatorMachineIds.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-950 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 text-amber-800 dark:text-amber-200">
                    <p className="font-bold">Tidak ada Penugasan Mesin</p>
                    <p className="text-sm">Anda belum ditugaskan ke mesin tertentu. Hubungi supervisor.</p>
                </div>
            )}

            {/* Jobs grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                {filteredOrders.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-20 text-muted-foreground bg-muted/20 rounded-2xl border-4 border-dashed">
                        {hasFilter ? (
                            <>
                                <p className="text-2xl font-bold">{kioskLabels.emptyNoFilterMatch} &quot;{searchParams.get('q')}&quot;</p>
                                <Button variant="link" onClick={clearFilter} className="text-xl">{kioskLabels.emptyClearFilter}</Button>
                            </>
                        ) : operatorMachineIds.length > 0 ? (
                            <>
                                <p className="text-2xl font-bold">{kioskLabels.emptyNoJobsForMachine.toUpperCase()}</p>
                                <p className="text-lg">{kioskLabels.emptyWaitingRelease}</p>
                            </>
                        ) : (
                            <>
                                <p className="text-2xl font-bold">{kioskLabels.emptyNoJobsReady.toUpperCase()}</p>
                                <p className="text-lg">{kioskLabels.emptyWaitingRelease}</p>
                            </>
                        )}
                    </div>
                ) : (
                    filteredOrders.map(order => (
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
