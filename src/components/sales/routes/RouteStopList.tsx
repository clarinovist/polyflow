'use client';

import { useState } from 'react';
import {
    GripVertical,
    Lock,
    MapPinOff,
    AlertTriangle,
    Trash2,
    Route,
    History,
} from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import {
    haversineDistance,
    formatDistance,
    isValidCoordinate,
} from '@/lib/utils/geo';
import { describeVisitAge } from '@/lib/sales/route-compliance';

export type RouteStopListItem = {
    customerId: string;
    name: string;
    code: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    /** Sudah ada kunjungan tertaut (visitCount > 0) — konsekuensi guard R2, tidak bisa dihapus. */
    locked: boolean;
    /** Customer ini juga dirutekan ke rep lain pada hari yang sama. */
    hasConflict: boolean;
    /** Umur kunjungan terakhir (R6). `undefined` = tidak ada data (customer di
     * luar cakupan getWeekBoard); `daysSince: null` = ADA data tapi belum
     * pernah dikunjungi sama sekali — dua hal ini wajib tampil beda. */
    visitAge?: { lastVisitAt: string | null; daysSince: number | null };
};

type RouteStopListProps = {
    items: RouteStopListItem[];
    onReorder: (orderedCustomerIds: string[]) => void;
    onRemove: (customerId: string) => void;
    disabled?: boolean;
};

/**
 * List stop dengan drag reorder (native HTML5 DnD — repo ini belum punya
 * dependency dnd-kit/react-beautiful-dnd, dan menambah satu untuk satu list
 * tidak sepadan; lihat catatan implementor).
 */
export function RouteStopList({
    items,
    onReorder,
    onRemove,
    disabled,
}: RouteStopListProps) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);

    function handleDrop(targetIndex: number) {
        if (dragIndex === null || dragIndex === targetIndex) {
            setDragIndex(null);
            setOverIndex(null);
            return;
        }
        const next = [...items];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(targetIndex, 0, moved);
        onReorder(next.map((i) => i.customerId));
        setDragIndex(null);
        setOverIndex(null);
    }

    if (items.length === 0) {
        return (
            <div className="p-8 text-center border rounded-lg">
                <p className="text-sm text-muted-foreground">
                    Belum ada stop. Pilih customer dari daftar kandidat.
                </p>
            </div>
        );
    }

    return (
        <div className="border rounded-lg max-h-[420px] overflow-y-auto">
            {items.map((item, idx) => {
                const prev = idx > 0 ? items[idx - 1] : null;
                const distanceFromPrev =
                    prev &&
                    isValidCoordinate(prev.latitude, prev.longitude) &&
                    isValidCoordinate(item.latitude, item.longitude)
                        ? haversineDistance(
                              prev.latitude!,
                              prev.longitude!,
                              item.latitude!,
                              item.longitude!,
                          )
                        : null;

                return (
                    <div
                        key={item.customerId}
                        draggable={!disabled}
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setOverIndex(idx);
                        }}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={() => {
                            setDragIndex(null);
                            setOverIndex(null);
                        }}
                        className={cn(
                            'flex items-center gap-2 p-3 border-b last:border-0 min-h-[52px] bg-background',
                            overIndex === idx &&
                                dragIndex !== null &&
                                dragIndex !== idx &&
                                'border-t-2 border-t-primary',
                        )}
                    >
                        <span
                            className={cn(
                                'shrink-0 text-muted-foreground',
                                disabled ? 'cursor-not-allowed' : 'cursor-grab',
                            )}
                            title="Seret untuk mengubah urutan"
                        >
                            <GripVertical className="h-4 w-4" />
                        </span>
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                {item.name}
                                {item.locked && (
                                    <Lock
                                        className="h-3 w-3 text-muted-foreground shrink-0"
                                        aria-label="Sudah ada kunjungan — tidak bisa dihapus, hanya urutan yang bisa diubah"
                                    />
                                )}
                            </p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                <span>
                                    {item.code || '-'}
                                    {item.city && ` · ${item.city}`}
                                </span>
                                {distanceFromPrev !== null && (
                                    <span
                                        className="inline-flex items-center gap-0.5"
                                        title="Jarak garis lurus dari stop sebelumnya"
                                    >
                                        <Route className="h-2.5 w-2.5" />
                                        {formatDistance(distanceFromPrev)}
                                    </span>
                                )}
                                {item.visitAge !== undefined &&
                                    (() => {
                                        const age = describeVisitAge(
                                            item.visitAge.daysSince,
                                        );
                                        return (
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-0.5',
                                                    age.isOverdue &&
                                                        'text-amber-600 font-medium',
                                                )}
                                                title="Umur kunjungan terakhir ke customer ini"
                                            >
                                                <History className="h-2.5 w-2.5" />
                                                {age.label}
                                            </span>
                                        );
                                    })()}
                                {(item.latitude == null ||
                                    item.longitude == null) && (
                                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                                        <MapPinOff className="h-2.5 w-2.5" />
                                        Tanpa GPS
                                    </span>
                                )}
                                {item.hasConflict && (
                                    <span className="inline-flex items-center gap-0.5 text-destructive font-medium">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        BENTROK
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onRemove(item.customerId)}
                            disabled={disabled || item.locked}
                            title={
                                item.locked
                                    ? 'Tidak bisa dihapus: sudah ada kunjungan tertaut'
                                    : 'Hapus dari rute'
                            }
                            className="p-1.5 hover:bg-destructive/10 text-destructive rounded shrink-0 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
