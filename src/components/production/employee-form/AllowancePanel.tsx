import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { AllowancePanelProps } from './types';

export function AllowancePanel({
    initialData,
    allowances,
    setAllowances,
    allowancesLoading,
}: AllowancePanelProps) {
    return (
        <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-semibold">
                        Tunjangan tetap
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                        {initialData
                            ? 'Transport, makan, dll — ikut snapshot ke payslip saat generate.'
                            : 'Simpan karyawan dulu, lalu edit ulang untuk menambah tunjangan.'}
                    </p>
                </div>
                {initialData && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() =>
                            setAllowances((rows) => [
                                ...rows,
                                {
                                    name: '',
                                    amount: '',
                                    isActive: true,
                                },
                            ])
                        }
                    >
                        <Plus className="h-3 w-3 mr-1" />{' '}
                        Tambah
                    </Button>
                )}
            </div>
            {initialData && allowancesLoading && (
                <p className="text-[11px] text-muted-foreground">
                    Memuat tunjangan…
                </p>
            )}
            {initialData &&
                allowances.map((row, idx) => (
                    <div
                        key={row.id ?? `new-${idx}`}
                        className="grid grid-cols-[1fr_120px_auto] gap-2 items-end"
                    >
                        <div className="space-y-1">
                            <Label className="text-[10px]">
                                Nama
                            </Label>
                            <Input
                                className="h-8 text-xs bg-background/50"
                                value={row.name}
                                placeholder="Tunjangan Transport"
                                onChange={(e) => {
                                    const next = [
                                        ...allowances,
                                    ];
                                    next[idx] = {
                                        ...row,
                                        name: e.target
                                            .value,
                                    };
                                    setAllowances(next);
                                }}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px]">
                                Nominal
                            </Label>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                className="h-8 text-xs bg-background/50"
                                value={row.amount}
                                onChange={(e) => {
                                    const next = [
                                        ...allowances,
                                    ];
                                    next[idx] = {
                                        ...row,
                                        amount: e.target
                                            .value,
                                    };
                                    setAllowances(next);
                                }}
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() =>
                                setAllowances(
                                    allowances.filter(
                                        (_, i) =>
                                            i !== idx,
                                    ),
                                )
                            }
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))}
            {initialData &&
                !allowancesLoading &&
                allowances.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">
                        Belum ada tunjangan.
                    </p>
                )}
        </div>
    );
}
