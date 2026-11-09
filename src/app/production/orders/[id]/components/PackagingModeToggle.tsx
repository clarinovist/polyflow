'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { setProductionOrderPackagingMode } from '@/actions/production/production-orders';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';

const LOCKED_STATUSES: readonly string[] = ['CANCELLED', 'CLOSED', 'COMPLETED'];
const TOGGLE_ID = 'packaging-mode-toggle';

interface Props {
    order: ExtendedProductionOrder;
}

export function PackagingModeToggle({ order }: Props) {
    const router = useRouter();
    const [enabled, setEnabled] = useState(order.actualPackagingEnabled);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setEnabled(order.actualPackagingEnabled);
    }, [order.actualPackagingEnabled]);

    const hasExecutions = (order.executions?.length ?? 0) > 0;
    const isLocked = LOCKED_STATUSES.includes(order.status);
    const isMapped = Boolean(order.requestedOutputVariantId);

    if (hasExecutions || isLocked) {
        return order.actualPackagingEnabled ? (
            <Badge variant="outline" className="text-xs font-medium">
                Kemasan aktual: Aktif
            </Badge>
        ) : null;
    }

    const handleChange = async (next: boolean) => {
        setIsSaving(true);
        try {
            const res = await setProductionOrderPackagingMode({
                id: order.id,
                enabled: next,
            });
            if (res?.success === false) throw new Error(res.error);
            setEnabled(next);
            toast.success(
                next
                    ? 'Kemasan aktual diaktifkan'
                    : 'Kemasan aktual dimatikan',
            );
            router.refresh();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Gagal mengubah kemasan aktual',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3"
            title={
                isMapped
                    ? 'Wajib aktif karena SPK memakai pemetaan produk kemasan'
                    : 'Operator kiosk wajib mengisi kemasan tiap catat hasil. Tidak bisa diubah setelah ada hasil.'
            }
        >
            <Label
                htmlFor={TOGGLE_ID}
                className="flex min-h-11 flex-1 cursor-pointer items-center text-sm"
            >
                Catat kemasan aktual
            </Label>
            <Switch
                id={TOGGLE_ID}
                checked={enabled}
                disabled={isSaving || (isMapped && enabled)}
                onCheckedChange={handleChange}
            />
        </div>
    );
}
