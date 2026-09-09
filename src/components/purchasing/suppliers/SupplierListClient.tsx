'use client';

import { useMemo, useState } from 'react';
import type { Supplier } from '@prisma/client';
import Link from 'next/link';
import { MapPin, Phone, Search, Truck, X } from 'lucide-react';
import { deleteSupplier } from '@/actions/purchasing/supplier';
import { SupplierDialog } from './SupplierDialog';
import { DeleteButton } from '@/components/common/DeleteButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

const nameLinkClass =
    'hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors';
type StatusFilter = 'all' | 'active' | 'inactive';

function SupplierActions({ supplier }: { supplier: Supplier }) {
    return (
        <div
            className="flex justify-end gap-2"
            role="group"
            aria-label={`Aksi ${supplier.name}`}
        >
            <SupplierDialog mode="edit" initialData={supplier} />
            <DeleteButton
                id={supplier.id}
                onDelete={deleteSupplier}
                entityName="Supplier"
            />
        </div>
    );
}

function SupplierStatus({ active }: { active: boolean }) {
    return (
        <Badge variant={active ? 'default' : 'secondary'}>
            {active ? 'Aktif' : 'Nonaktif'}
        </Badge>
    );
}

export function SupplierListClient({ suppliers }: { suppliers: Supplier[] }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const query = search.trim().toLowerCase();
    const filtered = useMemo(
        () =>
            suppliers.filter((supplier) => {
                const matchesSearch = [
                    supplier.name,
                    supplier.code,
                    supplier.phone,
                ].some((value) => value?.toLowerCase().includes(query));
                const matchesStatus =
                    filter === 'all' ||
                    supplier.isActive === (filter === 'active');
                return matchesSearch && matchesStatus;
            }),
        [suppliers, query, filter],
    );
    const filterButtons: {
        label: string;
        value: StatusFilter;
        count: number;
    }[] = [
        { label: 'Semua', value: 'all', count: suppliers.length },
        {
            label: 'Aktif',
            value: 'active',
            count: suppliers.filter((s) => s.isActive).length,
        },
        {
            label: 'Nonaktif',
            value: 'inactive',
            count: suppliers.filter((s) => !s.isActive).length,
        },
    ];
    const emptyMessage =
        query || filter !== 'all'
            ? 'Tidak ada supplier yang cocok.'
            : 'Belum ada supplier. Tambahkan supplier pertama Anda!';

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Supplier
                    </h1>
                    <p className="text-muted-foreground">
                        Kelola penyedia bahan baku dan jasa Anda
                    </p>
                </div>
                <SupplierDialog mode="create" />
            </div>

            <div className="space-y-3">
                <div className="relative">
                    <Search
                        aria-hidden="true"
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                        aria-label="Cari supplier"
                        placeholder="Cari nama, kode, atau telepon..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="pl-9 pr-9"
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label="Hapus pencarian"
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    {filterButtons.map((option) => (
                        <Button
                            key={option.value}
                            variant={
                                filter === option.value ? 'default' : 'outline'
                            }
                            aria-pressed={filter === option.value}
                            size="sm"
                            onClick={() => setFilter(option.value)}
                            className="h-7 text-xs"
                        >
                            {option.label}{' '}
                            <span className="ml-1">({option.count})</span>
                        </Button>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground" role="status">
                    Menampilkan {filtered.length} dari {suppliers.length}{' '}
                    supplier
                </p>
            </div>

            <div
                className="hidden md:block"
                data-testid="supplier-desktop-list"
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Telepon</TableHead>
                            <TableHead>Alamat</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px] text-right">
                                Aksi
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="h-64 text-center"
                                >
                                    <Truck className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
                                    <p className="text-muted-foreground">
                                        {emptyMessage}
                                    </p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((supplier) => (
                                <TableRow key={supplier.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">
                                        {supplier.code || '-'}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <Link
                                            href={`/purchasing/suppliers/${supplier.id}`}
                                            className={nameLinkClass}
                                        >
                                            {supplier.name}
                                        </Link>
                                    </TableCell>
                                    <TableCell>
                                        {supplier.phone ? (
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-3 w-3 text-muted-foreground" />
                                                {supplier.phone}
                                            </div>
                                        ) : (
                                            '-'
                                        )}
                                    </TableCell>
                                    <TableCell
                                        className="max-w-[300px] truncate"
                                        title={supplier.address || undefined}
                                    >
                                        {supplier.address || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <SupplierStatus
                                            active={supplier.isActive}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <SupplierActions supplier={supplier} />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div
                className="md:hidden space-y-3"
                data-testid="supplier-mobile-list"
            >
                {filtered.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>{emptyMessage}</p>
                    </div>
                ) : (
                    filtered.map((supplier) => (
                        <div
                            key={supplier.id}
                            className="border rounded-lg p-4 space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <Link
                                        href={`/purchasing/suppliers/${supplier.id}`}
                                        className={`font-semibold text-sm break-words ${nameLinkClass}`}
                                    >
                                        {supplier.name}
                                    </Link>
                                    <p className="text-xs text-muted-foreground font-mono">
                                        {supplier.code || '-'}
                                    </p>
                                </div>
                                <SupplierStatus active={supplier.isActive} />
                            </div>
                            {supplier.phone && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3" />
                                    {supplier.phone}
                                </div>
                            )}
                            {supplier.address && (
                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {supplier.address}
                                </div>
                            )}
                            <SupplierActions supplier={supplier} />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
