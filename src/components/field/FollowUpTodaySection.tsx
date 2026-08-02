'use client';

import NextLink from 'next/link';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type FollowUpItem = {
    id: string;
    orderNumber: string;
    customerName: string;
    nextFollowUpDate: string;
    isOverdue?: boolean;
};

type FollowUpTodaySectionProps = {
    items: FollowUpItem[];
};

function fmtDate(iso: string): string {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
        });
    } catch {
        return '-';
    }
}

export function FollowUpTodaySection({ items }: FollowUpTodaySectionProps) {
    if (!items || items.length === 0) return null;

    return (
        <div className="border rounded-2xl p-4 bg-card shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-600" />
                    <h3 className="font-bold text-sm text-foreground">
                        Follow-up Hari Ini
                    </h3>
                    <Badge
                        variant={
                            items.some((i) => i.isOverdue)
                                ? 'destructive'
                                : 'secondary'
                        }
                        className="text-[10px]"
                    >
                        {items.length}
                    </Badge>
                </div>
                <NextLink
                    href="/field/sales/orders?followUpDue=1"
                    className="text-[10px] font-semibold text-primary hover:underline"
                >
                    Lihat semua
                </NextLink>
            </div>

            <div className="space-y-1.5">
                {items.map((item) => (
                    <NextLink
                        key={item.id}
                        href={`/field/sales/orders/${item.id}`}
                        className="flex items-center justify-between p-2.5 border rounded-xl hover:bg-muted/50 active:scale-[0.98] transition-all min-h-[44px]"
                    >
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                                {item.customerName}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {item.orderNumber} ·{' '}
                                {fmtDate(item.nextFollowUpDate)}
                            </p>
                        </div>
                        <Badge
                            variant={item.isOverdue ? 'destructive' : 'outline'}
                            className="shrink-0 text-[10px]"
                        >
                            {item.isOverdue ? 'Terlambat' : 'Hari ini'}
                        </Badge>
                    </NextLink>
                ))}
            </div>
        </div>
    );
}
