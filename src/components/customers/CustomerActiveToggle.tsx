'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { toggleCustomerActive } from '@/actions/sales/customer';
import { toast } from 'sonner';

interface CustomerActiveToggleProps {
    id: string;
    isActive: boolean;
    onToggled?: (id: string, isActive: boolean) => void;
}

export function CustomerActiveToggle({
    id,
    isActive,
    onToggled,
}: CustomerActiveToggleProps) {
    const [checked, setChecked] = useState(isActive);
    const [isPending, setIsPending] = useState(false);

    async function handleCheckedChange(next: boolean) {
        setChecked(next);
        setIsPending(true);
        try {
            const result = await toggleCustomerActive({
                id,
                isActive: next,
            });
            if (result.success) {
                toast.success(
                    next ? 'Customer diaktifkan' : 'Customer dinonaktifkan',
                );
                onToggled?.(id, next);
            } else {
                setChecked(!next);
                toast.error(result.error || 'Gagal mengubah status customer.');
            }
        } catch {
            setChecked(!next);
            toast.error('Gagal mengubah status customer.');
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Switch
            checked={checked}
            disabled={isPending}
            onCheckedChange={handleCheckedChange}
            aria-label={checked ? 'Nonaktifkan customer' : 'Aktifkan customer'}
        />
    );
}
