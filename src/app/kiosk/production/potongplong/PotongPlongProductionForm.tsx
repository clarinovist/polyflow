'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { productionOutputSchema } from '@/lib/schemas/production';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CheckCircle2, PlusCircle, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { getProductionUnitMeta, toBaseQuantity } from '@/lib/utils/production-units';
import { Unit } from '@prisma/client';
import { getProductionShiftsByOrder } from '@/actions/production/production-shifts';

const bulkSchema = z.object({
    reports: z.array(productionOutputSchema)
});

type BulkFormValues = z.infer<typeof bulkSchema>;

type Employee = { id: string; name: string; code?: string };
type Machine = { id: string; name: string };
type Order = {
    id: string;
    orderNumber: string;
    bom?: {
        productVariant?: {
            name: string;
            primaryUnit?: string | null;
            salesUnit?: string | null;
            conversionFactor?: unknown;
        }
    }
};
type Shift = { id: string; shiftName: string; startTime: Date | string; endTime: Date | string };

/** Convert Date to `datetime-local` input value in LOCAL timezone (not UTC) */
function toLocalDatetime(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function makeEmpty(): BulkFormValues['reports'][0] {
    return {
        productionOrderId: '',
        machineId: '',
        operatorId: '',
        helperIds: [],
        shiftId: '',
        quantityProduced: 0,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        bruto: 0,
        bobin: 0,
        cekGram: '',
        startTime: new Date(),
        endTime: new Date(),
        notes: ''
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default function PotongPlongProductionForm({
    orders, machines, employees
}: {
    orders: Order[];
    machines: Machine[];
    employees: Employee[];
}) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [shiftsByOrder, setShiftsByOrder] = useState<Record<string, Shift[]>>({});
    const [loadingShifts, setLoadingShifts] = useState<Record<string, boolean>>({});

    const form = useForm<BulkFormValues>({
        resolver: zodResolver(bulkSchema) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        defaultValues: { reports: [makeEmpty()] }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "reports",
    });

    const fetchShiftsForOrder = useCallback(async (orderId: string) => {
        if (!orderId || shiftsByOrder[orderId]) return;
        setLoadingShifts(prev => ({ ...prev, [orderId]: true }));
        try {
            const result = await getProductionShiftsByOrder(orderId);
            if (result.success && result.data) {
                setShiftsByOrder(prev => ({ ...prev, [orderId]: result.data }));
            }
        } catch {
            // silently fail
        } finally {
            setLoadingShifts(prev => ({ ...prev, [orderId]: false }));
        }
    }, [shiftsByOrder]);

    useEffect(() => {
        fields.forEach((_, index) => {
            const orderId = form.watch(`reports.${index}.productionOrderId`);
            if (orderId) {
                fetchShiftsForOrder(orderId);
            }
        });
    });

    const onSubmit = async (data: BulkFormValues) => {
        setIsSubmitting(true);
        try {
            const reports = data.reports.map((report) => {
                const order = orders.find((item) => item.id === report.productionOrderId);
                const unitMeta = getProductionUnitMeta(order?.bom?.productVariant || {});
                if (!unitMeta.hasAlternateUnit || Number(report.quantityProduced) <= 0) {
                    return report;
                }

                const enteredQty = Number(report.quantityProduced);
                const baseQty = toBaseQuantity(enteredQty, unitMeta.conversionFactor);
                return {
                    ...report,
                    quantityProduced: baseQty,
                    enteredQuantity: enteredQty,
                    enteredUnit: unitMeta.salesUnit as Unit,
                    baseQuantityProduced: baseQty,
                    conversionFactorSnapshot: unitMeta.conversionFactor,
                };
            });

            const res = await fetch('/api/production/daily-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reports)
            });

            const json = await res.json();

            if (res.status === 207) {
                const failedCount = json.errors?.length ?? 0;
                const successCount = json.results?.length ?? 0;
                toast.warning(`${successCount} laporan berhasil, ${failedCount} gagal. Cek konsol untuk detail.`);
                console.error('Partial errors:', json.errors);
                return;
            }

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Gagal menyimpan laporan');
            }

            toast.success(`${json.count ?? reports.length} laporan berhasil disubmit!`);
            form.reset({ reports: [makeEmpty()] });
            router.refresh();
        } catch {
            toast.error('Gagal menyimpan data produksi. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {fields.map((field, index) => {
                    const selectedOrder = orders.find((order) => order.id === form.watch(`reports.${index}.productionOrderId`));
                    const unitMeta = getProductionUnitMeta(selectedOrder?.bom?.productVariant || {});

                    return (
                    <div key={field.id} className="relative p-6 rounded-2xl bg-white/5 dark:bg-zinc-900/5 border border-purple-500/20 dark:border-purple-500/30 backdrop-blur-md shadow-2xl flex flex-col gap-6 transition-all hover:bg-purple-900/10 dark:hover:bg-purple-900/20">
                        {/* Header Panel */}
                        <div className="flex justify-between items-center border-b border-purple-500/20 dark:border-purple-500/30 pb-4">
                            <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                                <span className="bg-purple-500/20 dark:bg-purple-500/30 text-purple-600 dark:text-purple-300 h-8 w-8 rounded-full flex items-center justify-center text-sm">{index + 1}</span>
                                Laporan Potong/Plong
                            </h3>
                            {fields.length > 1 && (
                                <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)} className="rounded-full">
                                    <Trash2 className="h-4 w-4 mr-2" /> Hapus
                                </Button>
                            )}
                        </div>

                        {/* Top Config row: WO, Mesin, Operator, Shift */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormField
                                control={form.control}
                                name={`reports.${index}.productionOrderId`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-purple-600 dark:text-purple-200/70">Work Order (SPK)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 dark:bg-zinc-800/50 border-purple-500/20 dark:border-purple-500/30 text-white">
                                                    <SelectValue placeholder="Pilih WO..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {orders.map(o => (
                                                    <SelectItem key={o.id} value={o.id}>{o.orderNumber} - {o.bom?.productVariant?.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name={`reports.${index}.machineId`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-purple-600 dark:text-purple-200/70">Mesin</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 dark:bg-zinc-800/50 border-purple-500/20 dark:border-purple-500/30 text-white">
                                                    <SelectValue placeholder="Pilih Mesin..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {machines.map(m => (
                                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name={`reports.${index}.operatorId`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-purple-600 dark:text-purple-200/70">Operator (Ketua)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 dark:bg-zinc-800/50 border-purple-500/20 dark:border-purple-500/30 text-white">
                                                    <SelectValue placeholder="Pilih Operator..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {employees.map(e => (
                                                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* FIX: Shift dropdown now uses ProductionShift from selected order */}
                            <FormField
                                control={form.control}
                                name={`reports.${index}.shiftId`}
                                render={({ field }) => {
                                    const currentOrderId = form.watch(`reports.${index}.productionOrderId`);
                                    const availableShifts = currentOrderId ? (shiftsByOrder[currentOrderId] || []) : [];
                                    const isLoading = currentOrderId ? loadingShifts[currentOrderId] : false;

                                    return (
                                    <FormItem>
                                        <FormLabel className="text-purple-600 dark:text-purple-200/70">Shift</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={!currentOrderId || isLoading}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 dark:bg-zinc-800/50 border-purple-500/20 dark:border-purple-500/30 text-white">
                                                    <SelectValue placeholder={isLoading ? "Memuat shift..." : (!currentOrderId ? "Pilih WO dulu" : "Pilih Shift...")} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {availableShifts.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.shiftName} ({new Date(s.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}–{new Date(s.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
                                                    </SelectItem>
                                                ))}
                                                {availableShifts.length === 0 && !isLoading && currentOrderId && (
                                                    <SelectItem value="none" disabled>Belum ada shift di WO ini</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                    );
                                }}
                            />
                        </div>

                        {/* Helper Selection */}
                        <FormField
                            control={form.control}
                            name={`reports.${index}.helperIds`}
                            render={({ field }) => {
                                const currentOperatorId = form.watch(`reports.${index}.operatorId`);
                                const eligibleHelpers = employees.filter(e => e.id !== currentOperatorId);
                                const currentHelpers: string[] = field.value ?? [];

                                const toggleHelper = (empId: string) => {
                                    const next = currentHelpers.includes(empId)
                                        ? currentHelpers.filter(id => id !== empId)
                                        : [...currentHelpers, empId];
                                    field.onChange(next);
                                };

                                return (
                                    <FormItem>
                                        <FormLabel className="text-purple-600 dark:text-purple-200/70 flex items-center gap-2">
                                            <Users className="h-4 w-4" /> Helper / Asisten
                                            {currentHelpers.length > 0 && (
                                                <span className="bg-purple-500/20 dark:bg-purple-500/30 text-purple-600 dark:text-purple-300 text-xs px-2 py-0.5 rounded-full font-bold">
                                                    {currentHelpers.length} dipilih
                                                </span>
                                            )}
                                        </FormLabel>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-purple-950/20 dark:bg-purple-950/30 rounded-lg border border-purple-500/10 dark:border-purple-500/20">
                                            {eligibleHelpers.map(e => (
                                                <label
                                                    key={e.id}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm border ${
                                                        currentHelpers.includes(e.id)
                                                            ? 'bg-purple-500/20 dark:bg-purple-500/30 border-purple-400/50 dark:border-purple-400/60 text-white font-semibold'
                                                            : 'border-purple-500/10 dark:border-purple-500/20 text-purple-600 dark:text-purple-200/50 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 hover:text-white'
                                                    }`}
                                                >
                                                    <Checkbox
                                                        checked={currentHelpers.includes(e.id)}
                                                        onCheckedChange={() => toggleHelper(e.id)}
                                                        className="border-purple-400/30 dark:border-purple-400/50"
                                                    />
                                                    {e.name}
                                                </label>
                                            ))}
                                            {eligibleHelpers.length === 0 && (
                                                <p className="text-purple-400 dark:text-purple-200/30 text-xs col-span-4">Pilih operator terlebih dahulu</p>
                                            )}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                );
                            }}
                        />

                        {/* Mid Data row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-purple-950/20 dark:bg-purple-950/30 p-4 rounded-xl border border-purple-500/10 dark:border-purple-500/20">
                            <FormField control={form.control} name={`reports.${index}.quantityProduced`} render={({ field }) => (
	                                <FormItem><FormLabel className="text-purple-600 dark:text-purple-200/70">Netto / Valid ({unitMeta.displayUnit})</FormLabel><FormControl>
	                                    <Input type="number" step="any" className="bg-slate-900/80 dark:bg-zinc-800/80 border-purple-500/30 dark:border-purple-500/40 text-green-500 dark:text-green-400 font-black text-xl shadow-[0_0_15px_rgba(74,222,128,0.1)]" {...field} />
	                                </FormControl><FormMessage /></FormItem>
	                            )}/>
                            <FormField control={form.control} name={`reports.${index}.scrapQuantity`} render={({ field }) => (
                                <FormItem><FormLabel className="text-purple-600 dark:text-purple-200/70">Scrap Potong (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 dark:bg-zinc-800/80 border-purple-500/20 dark:border-purple-500/30 text-red-500 dark:text-red-400" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.startTime`} render={({ field }) => (
                                <FormItem><FormLabel className="text-purple-600 dark:text-purple-200/70">Mulai Pukul</FormLabel><FormControl>
                                    <Input type="datetime-local" className="bg-slate-900/80 dark:bg-zinc-800/80 border-purple-500/20 dark:border-purple-500/30 text-white"
                                        value={field.value instanceof Date ? toLocalDatetime(field.value) : (field.value ? toLocalDatetime(field.value) : '')}
                                        onChange={(e) => field.onChange(new Date(e.target.value))} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.endTime`} render={({ field }) => (
                                <FormItem><FormLabel className="text-purple-600 dark:text-purple-200/70">Selesai Pukul</FormLabel><FormControl>
                                    <Input type="datetime-local" className="bg-slate-900/80 dark:bg-zinc-800/80 border-purple-500/20 dark:border-purple-500/30 text-white"
                                        value={field.value instanceof Date ? toLocalDatetime(field.value) : (field.value ? toLocalDatetime(field.value) : '')}
                                        onChange={(e) => field.onChange(new Date(e.target.value))} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                        </div>
                    </div>
                    );
                })}

                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-purple-950/30 dark:bg-purple-950/40 p-6 rounded-2xl border-t-4 border-purple-500/50 dark:border-purple-500/60 shadow-lg backdrop-blur-xl sticky bottom-4 z-50">
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        className="w-full md:w-auto font-bold rounded-full hover:scale-105 active:scale-95 transition-all text-purple-100 bg-purple-500/20 dark:bg-purple-500/30 hover:bg-purple-500/30 dark:hover:bg-purple-500/40 border-purple-500/30 dark:border-purple-500/40"
                        onClick={() => append(makeEmpty())}
                    >
                        <PlusCircle className="h-5 w-5 mr-2" />
                        Tambah Entry
                    </Button>

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        size="lg"
                        className="w-full md:w-auto font-black text-lg px-12 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] hover:scale-105 active:scale-95 transition-all bg-purple-600 dark:bg-purple-500 hover:bg-purple-500 dark:hover:bg-purple-400 text-white"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center"><div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" /> Memproses...</div>
                        ) : (
                            <><CheckCircle2 className="h-6 w-6 mr-2" /> SUBMIT SEMUA LAPORAN</>
                        )}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
