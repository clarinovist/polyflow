'use client';

import {
    getOwnerHppErpChain,
    listOwnerHppVariantOptions,
} from '@/actions/owner-hpp/owner-hpp';
import type { HppPriceSimulatorVariantOptionDTO } from '@/actions/production/hpp-price-simulator-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ErpChainResult } from '@/lib/owner-hpp/erp-chain';
import { useState } from 'react';
import { toast } from 'sonner';

interface ErpPickerProps {
    onApply: (chain: ErpChainResult) => void;
}

const MAX_VISIBLE_OPTIONS = 50;

interface PendingChain {
    productName: string;
    chain: ErpChainResult;
}

export function ErpPicker({ onApply }: ErpPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<
        HppPriceSimulatorVariantOptionDTO[] | null
    >(null);
    const [query, setQuery] = useState('');
    const [isBusy, setIsBusy] = useState(false);
    const [pending, setPending] = useState<PendingChain | null>(null);

    async function open() {
        setIsOpen(true);
        if (options !== null) return;
        setIsBusy(true);
        const result = await listOwnerHppVariantOptions();
        setIsBusy(false);
        if (result.success) setOptions(result.data);
        else toast.error(result.error);
    }

    async function choose(option: HppPriceSimulatorVariantOptionDTO) {
        setIsBusy(true);
        const result = await getOwnerHppErpChain(option.id);
        setIsBusy(false);
        if (!result.success) {
            toast.error(result.error);
            return;
        }
        setPending({ productName: option.name, chain: result.data });
    }

    function close() {
        setIsOpen(false);
        setPending(null);
        setQuery('');
    }

    if (!isOpen) {
        return (
            <Button type="button" onClick={open}>
                Isi dari ERP
            </Button>
        );
    }

    const needle = query.trim().toLowerCase();
    const visible = (options ?? [])
        .filter(
            (option) =>
                !needle ||
                `${option.name} ${option.skuCode}`
                    .toLowerCase()
                    .includes(needle),
        )
        .slice(0, MAX_VISIBLE_OPTIONS);

    return (
        <section
            aria-label="Isi dari ERP"
            className="w-full space-y-3 rounded-lg border bg-card p-3 md:p-4"
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                    Isi dari ERP (hanya membaca)
                </h2>
                <Button type="button" variant="ghost" size="sm" onClick={close}>
                    Tutup
                </Button>
            </div>

            {pending ? (
                <div className="space-y-3">
                    <p className="text-sm">
                        <strong>{pending.productName}</strong>:{' '}
                        {pending.chain.stages.length} tahap dari BOM default.
                        Ini <strong>mengganti semua tahap</strong> skenario
                        aktif; nama dan harga jual tetap.
                    </p>
                    {pending.chain.warnings.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            {pending.chain.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    ) : null}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            disabled={pending.chain.stages.length === 0}
                            onClick={() => {
                                onApply(pending.chain);
                                close();
                            }}
                        >
                            Terapkan
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPending(null)}
                        >
                            Pilih produk lain
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <Input
                        aria-label="Cari produk"
                        placeholder="Cari produk jadi atau SKU…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    {isBusy ? (
                        <p className="text-sm text-muted-foreground">Memuat…</p>
                    ) : null}
                    <ul className="max-h-64 divide-y overflow-auto rounded-md border">
                        {visible.map((option) => (
                            <li key={option.id}>
                                <button
                                    type="button"
                                    disabled={isBusy}
                                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                                    onClick={() => choose(option)}
                                >
                                    <span className="min-w-0 truncate">
                                        {option.name}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {option.skuCode} ·{' '}
                                        {option.primaryOutputUnit}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {options !== null && visible.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Tidak ada produk yang cocok.
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
