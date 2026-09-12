'use client';

import { useId, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn, formatRupiah } from '@/lib/utils/utils';

export interface SalesOrderCustomerOption {
    id: string;
    name: string;
    code?: string | null;
    city?: string | null;
    billingAddress?: string | null;
    shippingAddress?: string | null;
    phone?: string | null;
    creditLimit?: number | null;
}

interface SalesOrderCustomerPickerProps
    extends Omit<ButtonProps, 'onChange' | 'value'> {
    customers: SalesOrderCustomerOption[];
    value?: string;
    onChange: (customerId: string) => void;
    onAddCustomer: () => void;
    isOverLimit?: boolean;
}

function getStableIdentity(customer: SalesOrderCustomerOption) {
    return customer.code || `ID: ${customer.id}`;
}

function getCustomerContext(customer: SalesOrderCustomerOption) {
    return [
        customer.city,
        customer.billingAddress || customer.shippingAddress,
        customer.phone,
    ].filter((value): value is string => Boolean(value));
}

function getSearchValue(customer: SalesOrderCustomerOption) {
    return [
        customer.name,
        customer.code,
        customer.id,
        customer.city,
        customer.billingAddress,
        customer.shippingAddress,
        customer.phone,
    ]
        .filter((value): value is string => Boolean(value))
        .join(' ');
}

export function SalesOrderCustomerPicker({
    customers,
    value,
    onChange,
    onAddCustomer,
    isOverLimit = false,
    className,
    ...triggerProps
}: SalesOrderCustomerPickerProps) {
    const [open, setOpen] = useState(false);
    const listboxId = useId();
    const selectedCustomer = customers.find((customer) => customer.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    {...triggerProps}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-controls={listboxId}
                    aria-expanded={open}
                    className={cn(
                        'w-full justify-between',
                        !selectedCustomer && 'text-muted-foreground',
                        isOverLimit &&
                            'border-red-500 bg-red-50 text-red-900',
                        className,
                    )}
                >
                    <span className="truncate">
                        {selectedCustomer
                            ? `${selectedCustomer.name} — ${getStableIdentity(selectedCustomer)}`
                            : 'Pilih customer'}
                    </span>
                    <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                id={listboxId}
                className="w-[--radix-popover-trigger-width] p-0"
            >
                <Command>
                    <CommandInput placeholder="Cari customer..." />
                    <CommandList>
                        <CommandEmpty>Customer tidak ditemukan.</CommandEmpty>
                        <CommandGroup>
                            {customers.map((customer) => {
                                const context = getCustomerContext(customer);

                                return (
                                    <CommandItem
                                        key={customer.id}
                                        value={getSearchValue(customer)}
                                        onSelect={() => {
                                            onChange(customer.id);
                                            setOpen(false);
                                        }}
                                        className="items-start"
                                    >
                                        <Check
                                            className={cn(
                                                'mt-0.5 h-4 w-4',
                                                customer.id === value
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-baseline gap-x-2">
                                                <span className="font-medium">
                                                    {customer.name}
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {getStableIdentity(customer)}
                                                </span>
                                            </div>
                                            {context.length > 0 && (
                                                <div className="truncate text-xs text-muted-foreground">
                                                    {context.join(' • ')}
                                                </div>
                                            )}
                                        </div>
                                        {!!customer.creditLimit && (
                                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                                Limit:{' '}
                                                {formatRupiah(customer.creditLimit)}
                                            </span>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem
                                value="add-customer"
                                keywords={['tambah customer baru']}
                                onSelect={() => {
                                    setOpen(false);
                                    onAddCustomer();
                                }}
                                className="cursor-pointer text-blue-600"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Tambah Customer Baru
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
                <div className="border-t p-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        aria-label="Tutup pemilih customer"
                        onClick={() => setOpen(false)}
                    >
                        Tutup
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
