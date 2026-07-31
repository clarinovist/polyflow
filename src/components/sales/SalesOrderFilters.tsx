'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { salesLabels } from '@/lib/labels';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/utils';
import {
    CustomerCombobox,
    type CustomerComboboxOption,
} from '@/components/customers/CustomerCombobox';
import { X } from 'lucide-react';

interface SalesOrderFiltersProps {
    customers: CustomerComboboxOption[];
}

const STATUS_OPTIONS = [
    { value: 'QUOTATION', label: 'Penawaran' },
    { value: 'QUOTATION_SENT', label: 'Penawaran Dikirim' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'CONFIRMED', label: 'Dikonfirmasi' },
    { value: 'IN_PRODUCTION', label: 'Produksi' },
    { value: 'READY_TO_SHIP', label: 'Siap kirim' },
    { value: 'SHIPPED', label: 'Dikirim' },
    { value: 'DELIVERED', label: 'Terkirim' },
    { value: 'QUOTATION_REJECTED', label: 'Ditolak' },
    { value: 'QUOTATION_EXPIRED', label: 'Kadarluarsa' },
    { value: 'CANCELLED', label: 'Dibatalkan' },
];

/** Phase tabs — quick filter groups */
const PHASE_TABS = [
    { value: '', label: 'Semua aktif' },
    {
        value: 'QUOTATION,QUOTATION_SENT',
        label: 'Penawaran',
    },
    { value: 'DRAFT', label: 'Draft order' },
    {
        value: 'CONFIRMED,IN_PRODUCTION,READY_TO_SHIP,SHIPPED',
        label: 'Berjalan',
    },
    { value: 'DELIVERED', label: 'Selesai' },
    {
        value: 'QUOTATION_REJECTED,QUOTATION_EXPIRED,CANCELLED',
        label: 'Ditolak / Batal',
    },
];

const FULFILL_OPTIONS = [
    { value: 'stock', label: salesLabels.fulfillFromStock },
    { value: 'produce', label: salesLabels.fulfillProduce },
    { value: 'maklon', label: salesLabels.fulfillMaklon },
];

const PAYMENT_OPTIONS = [
    { value: 'outstanding', label: 'Belum lunas' },
    { value: 'paid', label: 'Lunas' },
    { value: 'no_invoice', label: 'Belum invoice' },
];

function FilterSelect({
    label,
    paramKey,
    currentValue,
    options,
}: {
    label: string;
    paramKey: string;
    currentValue: string;
    options: { value: string; label: string }[];
}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleChange = useCallback(
        (value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            // Drop legacy view param if present — filters are the only mode now
            params.delete('view');
            if (value === '__all__') {
                params.delete(paramKey);
            } else {
                params.set(paramKey, value);
            }
            router.push(`/sales/orders?${params.toString()}`, {
                scroll: false,
            });
        },
        [router, searchParams, paramKey],
    );

    return (
        <Select value={currentValue || '__all__'} onValueChange={handleChange}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__all__">Semua</SelectItem>
                {options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function SalesOrderFilters({ customers }: SalesOrderFiltersProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const currentStatus = searchParams.get('status') || '';
    const currentCustomer = searchParams.get('customer') || '';

    const handleCustomerChange = useCallback(
        (customerId: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('view');
            if (customerId) {
                params.set('customer', customerId);
            } else {
                params.delete('customer');
            }
            router.push(`/sales/orders?${params.toString()}`, {
                scroll: false,
            });
        },
        [router, searchParams],
    );

    const handlePhaseClick = useCallback(
        (phaseValue: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('view');
            if (phaseValue) {
                params.set('status', phaseValue);
            } else {
                params.delete('status');
            }
            router.push(`/sales/orders?${params.toString()}`, {
                scroll: false,
            });
        },
        [router, searchParams],
    );

    return (
        <div className="flex flex-col gap-3">
            {/* Phase tabs */}
            <div className="flex flex-wrap gap-1.5">
                {PHASE_TABS.map((tab) => {
                    const isActive =
                        tab.value === currentStatus ||
                        (tab.value === '' && currentStatus === '');
                    return (
                        <Button
                            key={tab.value}
                            variant={isActive ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                                'h-7 text-xs px-3',
                                isActive && 'shadow-sm',
                            )}
                            onClick={() => handlePhaseClick(tab.value)}
                        >
                            {tab.label}
                        </Button>
                    );
                })}
            </div>
            {/* Detailed filters */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-1">
                    <CustomerCombobox
                        customers={customers}
                        value={currentCustomer}
                        onChange={handleCustomerChange}
                        placeholder="Semua customer"
                        className="h-8 w-[220px] text-xs"
                    />
                    {currentCustomer && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCustomerChange('')}
                            aria-label="Hapus filter customer"
                            title="Semua customer"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <FilterSelect
                    label="Status"
                    paramKey="status"
                    currentValue={currentStatus}
                    options={STATUS_OPTIONS}
                />
                <FilterSelect
                    label="Cara penuhi"
                    paramKey="fulfill"
                    currentValue={searchParams.get('fulfill') || ''}
                    options={FULFILL_OPTIONS}
                />
                <FilterSelect
                    label="Pembayaran"
                    paramKey="payment"
                    currentValue={searchParams.get('payment') || ''}
                    options={PAYMENT_OPTIONS}
                />
            </div>
        </div>
    );
}
