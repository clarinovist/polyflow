'use client';

import { Search, Plus, MapPinOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isValidCoordinate } from '@/lib/utils/geo';
import type { DrawerCustomer } from './use-route-day-plan';
import type { TemplateDate } from './use-route-day-tools';

type RouteCandidatePickerProps = {
    search: string;
    onSearchChange: (value: string) => void;
    showAllCustomers: boolean;
    onShowAllCustomersChange: (value: boolean) => void;
    candidates: DrawerCustomer[];
    onAdd: (customer: DrawerCustomer) => void;
    showTemplatePicker: boolean;
    templateDates: TemplateDate[];
    onCloseTemplatePicker: () => void;
    onCopyFromTemplate: (fromDate: string) => void;
};

/**
 * Kandidat "dekat rute ini & belum masuk minggu ini" (diurutkan jarak oleh
 * use-route-day-plan.ts) + picker template tanggal sumber. R11: customer
 * tanpa GPS ditandai di sini juga, bukan cuma di RouteStopList.
 */
export function RouteCandidatePicker({
    search,
    onSearchChange,
    showAllCustomers,
    onShowAllCustomersChange,
    candidates,
    onAdd,
    showTemplatePicker,
    templateDates,
    onCloseTemplatePicker,
    onCopyFromTemplate,
}: RouteCandidatePickerProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Cari customer..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-8 h-8 text-xs"
                    />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    <input
                        type="checkbox"
                        checked={showAllCustomers}
                        onChange={(e) =>
                            onShowAllCustomersChange(e.target.checked)
                        }
                    />
                    Semua customer
                </label>
            </div>
            <div className="border rounded-lg max-h-[180px] overflow-y-auto">
                {candidates.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                        {showAllCustomers
                            ? 'Tidak ada customer cocok'
                            : 'Tidak ada customer assigned ke rep ini — coba centang "Semua customer"'}
                    </p>
                ) : (
                    candidates.slice(0, 30).map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => onAdd(c)}
                            className="w-full text-left px-3 py-2 border-b last:border-0 flex items-center justify-between gap-2 hover:bg-muted/50 min-h-[40px]"
                        >
                            <span className="min-w-0">
                                <span className="text-xs font-medium truncate flex items-center gap-1.5">
                                    {c.name}
                                    {!isValidCoordinate(
                                        c.latitude,
                                        c.longitude,
                                    ) && (
                                        <MapPinOff
                                            className="h-3 w-3 text-amber-600 shrink-0"
                                            aria-label="Tanpa GPS"
                                        />
                                    )}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {c.code || '-'}
                                    {c.city && ` · ${c.city}`}
                                </span>
                            </span>
                            <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                    ))
                )}
            </div>

            {showTemplatePicker && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold">
                            Pilih tanggal sumber
                        </p>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px]"
                            onClick={onCloseTemplatePicker}
                        >
                            Tutup
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {templateDates.map((rd) => (
                            <button
                                key={String(rd.date)}
                                type="button"
                                onClick={() =>
                                    onCopyFromTemplate(String(rd.date))
                                }
                                className="text-left p-2 border rounded hover:bg-background text-[10px]"
                            >
                                {new Date(rd.date).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                })}{' '}
                                · {rd.itemCount} toko
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
