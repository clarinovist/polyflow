'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { CustomerDestination } from '@/lib/production/order-context';

export function OrderCustomerPicker({
    customers,
    value,
    onChange,
    disabled = false,
}: {
    customers: CustomerDestination[];
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
}) {
    const [search, setSearch] = useState('');
    const id = useId();
    const filtered = customers.filter((c) =>
        c.name
            .toLocaleLowerCase('id-ID')
            .includes(search.toLocaleLowerCase('id-ID')),
    );
    return (
        <fieldset disabled={disabled} className="space-y-2 min-w-0">
            <legend className="text-sm font-medium">
                Customer tujuan (bisa lebih dari satu)
            </legend>
            <p className="text-xs text-muted-foreground">
                Informasi tujuan produksi, bukan pembagian kuantitas. Customer
                dari SO/maklon tetap disertakan otomatis.
            </p>
            <label htmlFor={id} className="block text-sm">
                Cari customer
            </label>
            <Input
                id={id}
                className="min-h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={disabled}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
                {value.length} customer dipilih
            </p>
            {value.length > 0 && (
                <div
                    className="flex flex-wrap gap-2"
                    aria-label="Customer terpilih"
                >
                    {customers
                        .filter((customer) => value.includes(customer.id))
                        .map((customer) => (
                            <button
                                key={customer.id}
                                type="button"
                                disabled={disabled}
                                aria-label={`Hapus pilihan ${customer.name}`}
                                className="min-h-11 rounded-lg border bg-muted px-3 text-sm"
                                onClick={() =>
                                    onChange(
                                        value.filter(
                                            (id) => id !== customer.id,
                                        ),
                                    )
                                }
                            >
                                {customer.name}{' '}
                                <span aria-hidden="true">×</span>
                            </button>
                        ))}
                </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                {filtered.length ? (
                    filtered.map((c) => (
                        <label
                            key={c.id}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-muted"
                        >
                            <input
                                type="checkbox"
                                checked={value.includes(c.id)}
                                disabled={disabled}
                                onChange={(e) =>
                                    onChange(
                                        e.target.checked
                                            ? [...value, c.id]
                                            : value.filter((v) => v !== c.id),
                                    )
                                }
                            />
                            <span className="text-sm break-words min-w-0">
                                {c.name}
                            </span>
                        </label>
                    ))
                ) : (
                    <p className="p-2 text-sm text-muted-foreground">
                        Customer tidak ditemukan.
                    </p>
                )}
            </div>
        </fieldset>
    );
}
