'use client';

import React, { useState } from 'react';
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

const bulkSchema = z.object({
    reports: z.array(productionOutputSchema)
});

type BulkFormValues = z.infer<typeof bulkSchema>;

type Employee = { id: string; name: string; code?: string };
type Machine = { id: string; name: string };
type Order = { id: string; orderNumber: string; bom?: { productVariant?: { name: string } } };
type Shift = { id: string; name: string; startTime: string; endTime: string };

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

export default function HdProductionForm({
    orders, machines, employees, shifts
}: {
    orders: Order[];
    machines: Machine[];
    employees: Employee[];
    shifts: Shift[];
}) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<BulkFormValues>({
        resolver: zodResolver(bulkSchema) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        defaultValues: { reports: [makeEmpty()] }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "reports",
    });

    const onSubmit = async (data: BulkFormValues) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/production/daily-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.reports)
            });

            const json = await res.json();

            if (res.status === 207) {
                // Partial success: some entries failed
                const failedCount = json.errors?.length ?? 0;
                const successCount = json.results?.length ?? 0;
                toast.warning(`${successCount} laporan berhasil, ${failedCount} gagal. Cek konsol untuk detail.`);
                console.error('Partial errors:', json.errors);
                return;
            }

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Gagal menyimpan laporan');
            }

            toast.success(`${json.count ?? data.reports.length} laporan berhasil disubmit!`);
            form.reset({ reports: [makeEmpty()] });
            router.refresh();
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {fields.map((field, index) => (
                    <div key={field.id} className="relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col gap-6 transition-all hover:bg-white/10">
                        {/* Header Panel */}
                        <div className="flex justify-between items-center border-b border-white/10 pb-4">
                            <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                                <span className="bg-primary/20 text-primary h-8 w-8 rounded-full flex items-center justify-center text-sm">{index + 1}</span>
                                Laporan Output Baru
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
                                        <FormLabel className="text-white/70">Work Order (SPK)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 border-white/10 text-white">
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
                                        <FormLabel className="text-white/70">Mesin</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 border-white/10 text-white">
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
                                        <FormLabel className="text-white/70">Operator (Ketua)</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 border-white/10 text-white">
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

                            {/* FIX: Shift dropdown now uses real DB IDs */}
                            <FormField
                                control={form.control}
                                name={`reports.${index}.shiftId`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-white/70">Shift</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-slate-900/50 border-white/10 text-white">
                                                    <SelectValue placeholder="Pilih Shift..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {shifts.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.name} ({s.startTime}–{s.endTime})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
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
                                        <FormLabel className="text-white/70 flex items-center gap-2">
                                            <Users className="h-4 w-4" /> Helper / Asisten
                                            {currentHelpers.length > 0 && (
                                                <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-bold">
                                                    {currentHelpers.length} dipilih
                                                </span>
                                            )}
                                        </FormLabel>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-black/20 rounded-lg border border-white/5">
                                            {eligibleHelpers.map(e => (
                                                <label
                                                    key={e.id}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm border ${
                                                        currentHelpers.includes(e.id)
                                                            ? 'bg-primary/20 border-primary/50 text-white font-semibold'
                                                            : 'border-white/5 text-white/60 hover:bg-white/5 hover:text-white'
                                                    }`}
                                                >
                                                    <Checkbox
                                                        checked={currentHelpers.includes(e.id)}
                                                        onCheckedChange={() => toggleHelper(e.id)}
                                                        className="border-white/30"
                                                    />
                                                    {e.name}
                                                </label>
                                            ))}
                                            {eligibleHelpers.length === 0 && (
                                                <p className="text-white/30 text-xs col-span-4">Pilih operator terlebih dahulu</p>
                                            )}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                );
                            }}
                        />

                        {/* Mid Data row: Bruto, Bobin, Netto, Cek Gram */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/20 p-4 rounded-xl">
                            <FormField control={form.control} name={`reports.${index}.bruto`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Bruto (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 border-white/10 text-primary font-bold text-lg" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.bobin`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Bobin (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 border-white/10 text-yellow-400 font-bold text-lg" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.quantityProduced`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Netto / Valid (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 border-white/20 text-green-400 font-black text-xl shadow-[0_0_15px_rgba(74,222,128,0.2)]" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.cekGram`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Cek Gram</FormLabel><FormControl>
                                    <Input {...field} placeholder="Contoh: 12g" className="bg-slate-900/80 border-white/10 text-white" />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                        </div>

                        {/* Scrap & Time row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <FormField control={form.control} name={`reports.${index}.scrapProngkolQty`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Scrap Lumps (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 border-white/10 text-red-400" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.scrapDaunQty`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Scrap Daun (Kg)</FormLabel><FormControl>
                                    <Input type="number" step="any" className="bg-slate-900/80 border-white/10 text-red-400" {...field} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.startTime`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Mulai Pukul</FormLabel><FormControl>
                                    <Input type="datetime-local" className="bg-slate-900/80 border-white/10 text-white"
                                        value={field.value instanceof Date ? toLocalDatetime(field.value) : (field.value ? toLocalDatetime(field.value) : '')}
                                        onChange={(e) => field.onChange(new Date(e.target.value))} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`reports.${index}.endTime`} render={({ field }) => (
                                <FormItem><FormLabel className="text-white/70">Selesai Pukul</FormLabel><FormControl>
                                    <Input type="datetime-local" className="bg-slate-900/80 border-white/10 text-white"
                                        value={field.value instanceof Date ? toLocalDatetime(field.value) : (field.value ? toLocalDatetime(field.value) : '')}
                                        onChange={(e) => field.onChange(new Date(e.target.value))} />
                                </FormControl><FormMessage /></FormItem>
                            )}/>
                        </div>
                    </div>
                ))}

                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card/10 p-6 rounded-2xl border-t-4 border-primary/50 shadow-lg backdrop-blur-xl sticky bottom-4 z-50">
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        className="w-full md:w-auto font-bold rounded-full hover:scale-105 active:scale-95 transition-all text-white bg-white/10 hover:bg-white/20 border-white/20"
                        onClick={() => append(makeEmpty())}
                    >
                        <PlusCircle className="h-5 w-5 mr-2" />
                        Tambah Entry
                    </Button>

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        size="lg"
                        className="w-full md:w-auto font-black text-lg px-12 rounded-full shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] hover:scale-105 active:scale-95 transition-all"
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
