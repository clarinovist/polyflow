/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { quickCreateProductionOrder } from '@/actions/production/production-orders';
import type { MobileQuickSpkFormData } from '@/actions/production/mobile-supervisor';

function getCompatibleMachineFilter(category: string): (type: string) => boolean {
    const c = (category || '').toUpperCase();
    if (c === 'MIXING') return (t) => t === 'MIXER';
    if (c === 'EXTRUSION') return (t) => t === 'EXTRUDER' || t === 'REWINDER';
    if (c === 'PACKING') return (t) => t === 'PACKER' || t === 'GRANULATOR';
    if (c === 'REWORK') return () => true;
    return (t) => t === 'EXTRUDER' || t === 'MIXER';
}

export function QuickCreateClient({
    initialData,
}: {
    initialData: MobileQuickSpkFormData;
}) {
    const router = useRouter();
    const [bomId, setBomId] = useState('');
    const [qty, setQty] = useState('');
    const [machineId, setMachineId] = useState('');
    const [priority, setPriority] = useState<'NORMAL' | 'URGENT' | 'LOW'>('NORMAL');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [requestId, setRequestId] = useState(() => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const selectedBom = useMemo(() => initialData.boms.find((b) => b.id === bomId), [initialData.boms, bomId]);

    const compatibleMachines = useMemo(() => {
        if (!selectedBom) return initialData.machines;
        const filterFn = getCompatibleMachineFilter(selectedBom.category);
        const compatibles = initialData.machines.filter((m) => filterFn(m.type));
        return compatibles.length > 0 ? compatibles : initialData.machines;
    }, [selectedBom, initialData.machines]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bomId || !qty || !machineId) {
            toast.error('Lengkapi produk, jumlah, dan mesin');
            return;
        }
        const numQty = parseFloat(qty);
        if (isNaN(numQty) || numQty <= 0) {
            toast.error('Jumlah harus > 0');
            return;
        }

        if (submitting) return; // double-submit guard
        setSubmitting(true);
        try {
            const result = await quickCreateProductionOrder({
                bomId,
                plannedQuantity: numQty,
                machineId,
                clientRequestId: requestId,
                notes: notes.trim() || undefined,
                priority,
            });

            if (result.success) {
                const spkNumber = (result.data as any)?.orderNumber || (result.data as any)?.id?.slice(0, 8) || 'SPK';
                toast.success(`SPK ${spkNumber} berhasil dibuat — terlihat di Kiosk`);
                // refresh id for next create
                setRequestId(`req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
                router.push('/production/mobile/tasks?status=RELEASED');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal membuat SPK');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Gagal membuat SPK';
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border bg-white p-4 space-y-4 dark:bg-slate-800 dark:border-slate-700">
                {/* BOM */}
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Produk / BOM *</label>
                    <select
                        value={bomId}
                        onChange={(e) => {
                            setBomId(e.target.value);
                            setMachineId('');
                        }}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                    >
                        <option value="">Pilih produk...</option>
                        {initialData.boms.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.productVariantName} — {b.category} {b.isDefault ? '(Default)' : ''}
                            </option>
                        ))}
                    </select>
                    {initialData.boms.length === 0 && (
                        <p className="mt-1 text-xs text-red-500">Tidak ada BOM aktif. Buat BOM di desktop dulu.</p>
                    )}
                    {selectedBom && (
                        <p className="mt-1 text-[11px] text-slate-500">
                            SKU: {selectedBom.skuCode || '-'} • Kategori: {selectedBom.category} • Produk: {selectedBom.productName}
                        </p>
                    )}
                </div>

                {/* Qty */}
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Jumlah Target *</label>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        placeholder="500"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                </div>

                {/* Machine */}
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Mesin *</label>
                    <select
                        value={machineId}
                        onChange={(e) => setMachineId(e.target.value)}
                        disabled={!bomId}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:bg-slate-900 dark:border-slate-700"
                    >
                        <option value="">
                            {bomId ? (compatibleMachines.length > 0 ? 'Pilih mesin...' : 'Tidak ada mesin cocok') : 'Pilih produk dulu'}
                        </option>
                        {compatibleMachines.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.code} — {m.name} ({m.type})
                            </option>
                        ))}
                    </select>
                    {selectedBom && compatibleMachines.length === 0 && (
                        <p className="mt-1 text-xs text-amber-600">Tidak ada mesin yang cocok untuk {selectedBom.category}, tapi daftar semua mesin tetap ditampilkan bila filter kosong.</p>
                    )}
                </div>

                {/* Priority */}
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Prioritas</label>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                    >
                        <option value="NORMAL">Normal</option>
                        <option value="URGENT">Mendesak</option>
                        <option value="LOW">Rendah</option>
                    </select>
                </div>

                {/* Notes */}
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Catatan (opsional)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Alasan mendadak, instruksi khusus..."
                        rows={3}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                </div>

                {/* Audit hint */}
                <div className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    SPK ini dicatat dengan actor supervisor mobile dan langsung ter-revalidate ke <code>/kiosk/jobs</code>. Lokasi output otomatis dari mapping BOM → lokasi existing.
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting || !bomId || !qty || !machineId}
                className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {submitting ? 'Membuat SPK...' : 'Buat SPK & Kirim ke Kiosk'}
            </button>

            <button
                type="button"
                onClick={() => router.back()}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
            >
                Batal
            </button>
        </form>
    );
}
