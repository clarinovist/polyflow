'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronsUpDown, SlidersHorizontal } from 'lucide-react';
import { InfoHint } from '@/components/common/InfoHint';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandItem,
    CommandGroup,
} from '@/components/ui/command';
import {
    OUTPUT_REPORT_PATH,
    PROCESS_LABELS,
    outputReportHref,
    parseOutputReportFilter,
    reportPresets,
    type OutputReport,
    type OutputReportFilter,
    type ReportOption,
} from '@/lib/production/output-report';

function SearchChoice({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: ReportOption[];
    onChange: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const choices = [{ id: '', label: `Semua ${label}` }, ...options];
    if (value && !options.some((o) => o.id === value)) {
        choices.push({
            id: value,
            label: 'Pilihan tersimpan (tidak ada hasil pada periode ini)',
        });
    }
    return (
        <div className="min-w-0 space-y-1">
            <span className="text-xs font-medium">{label}</span>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-label={label}
                        aria-expanded={open}
                        className="h-11 w-full min-w-0 justify-between font-normal"
                    >
                        <span className="truncate">
                            {choices.find((o) => o.id === value)?.label}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    className="w-[min(24rem,calc(100vw-2rem))] p-0"
                >
                    <Command label={`Cari ${label}`}>
                        <CommandInput
                            aria-label={`Cari ${label}`}
                            placeholder={`Cari ${label.toLowerCase()}…`}
                        />
                        <CommandList>
                            <CommandEmpty>
                                Tidak ada pilihan yang cocok.
                            </CommandEmpty>
                            <CommandGroup>
                                {choices.map((o) => (
                                    <CommandItem
                                        key={o.id}
                                        value={o.id || '__all'}
                                        keywords={[o.label]}
                                        onSelect={() => {
                                            onChange(o.id);
                                            setOpen(false);
                                        }}
                                        className="min-h-11"
                                    >
                                        <Check
                                            className={
                                                value === o.id
                                                    ? 'size-4 shrink-0'
                                                    : 'size-4 shrink-0 opacity-0'
                                            }
                                        />
                                        <span>{o.label}</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function ReportFilters({
    filter,
    options,
    today,
}: {
    filter: OutputReportFilter;
    options: OutputReport['options'];
    today: string;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState(filter);
    const [advancedOpen, setAdvancedOpen] = useState(
        Boolean(
            filter.process ||
                filter.productVariantId ||
                filter.operatorId ||
                filter.machineId,
        ),
    );
    const [error, setError] = useState('');
    const [pending, startTransition] = useTransition();
    const advancedFilterCount = [
        draft.process,
        draft.productVariantId,
        draft.operatorId,
        draft.machineId,
    ].filter(Boolean).length;
    const set = (updates: Partial<OutputReportFilter>) =>
        setDraft((current) => ({ ...current, ...updates }));
    const apply = (next = draft) => {
        try {
            const validated = parseOutputReportFilter({ ...next, page: '1' });
            setError('');
            startTransition(() => router.push(outputReportHref(validated)));
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Filter tidak valid.',
            );
        }
    };
    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                apply();
            }}
            className="overflow-hidden rounded-xl border bg-card"
            aria-label="Filter rekap produksi"
            aria-busy={pending}
        >
            <fieldset disabled={pending} className="min-w-0 border-0 p-0">
                <div className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                            <h2 className="text-sm font-semibold">
                                Filter laporan
                            </h2>
                            <InfoHint label="Info periode laporan">
                                Periode maksimal 366 hari dan mengikuti waktu
                                Indonesia Barat (WIB).
                            </InfoHint>
                        </div>
                        <div
                            className="flex flex-wrap items-center gap-1"
                            aria-label="Pilihan periode cepat"
                        >
                            <span className="mr-1 text-xs text-muted-foreground">
                                Periode cepat
                            </span>
                            {reportPresets(today).map((preset) => (
                                <Button
                                    key={preset.label}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => {
                                        const next = {
                                            ...draft,
                                            from: preset.from,
                                            to: preset.to,
                                        };
                                        setDraft(next);
                                        apply(next);
                                    }}
                                >
                                    {preset.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(16rem,1.4fr)_auto]">
                        <div className="space-y-1">
                            <label
                                htmlFor="report-from"
                                className="text-xs font-medium"
                            >
                                Dari (WIB)
                            </label>
                            <Input
                                id="report-from"
                                type="date"
                                required
                                value={draft.from}
                                max={draft.to}
                                onChange={(event) =>
                                    set({ from: event.target.value })
                                }
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-1">
                            <label
                                htmlFor="report-to"
                                className="text-xs font-medium"
                            >
                                Sampai (WIB)
                            </label>
                            <Input
                                id="report-to"
                                type="date"
                                required
                                value={draft.to}
                                min={draft.from}
                                onChange={(event) =>
                                    set({ to: event.target.value })
                                }
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-1">
                            <label
                                htmlFor="report-query"
                                className="text-xs font-medium"
                            >
                                Cari produk / varian / SKU
                            </label>
                            <Input
                                id="report-query"
                                value={draft.q}
                                maxLength={120}
                                onChange={(event) =>
                                    set({ q: event.target.value })
                                }
                                placeholder="Ketik nama atau SKU…"
                                className="h-11"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="h-11 lg:self-end lg:px-6"
                        >
                            {pending ? 'Memuat…' : 'Terapkan'}
                        </Button>
                    </div>
                </div>

                <div className="border-t bg-muted/20">
                    <div className="flex flex-wrap items-center gap-2 p-2">
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-11"
                            aria-expanded={advancedOpen}
                            aria-controls="report-advanced-filters"
                            onClick={() => setAdvancedOpen((open) => !open)}
                        >
                            <SlidersHorizontal className="size-4" />
                            Filter lanjutan
                            {advancedFilterCount > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="ml-1 min-w-5 px-1.5"
                                >
                                    {advancedFilterCount}
                                </Badge>
                            )}
                            <ChevronDown
                                className={`size-4 transition-transform ${
                                    advancedOpen ? 'rotate-180' : ''
                                }`}
                            />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="ml-auto h-11"
                            onClick={() =>
                                startTransition(() =>
                                    router.push(OUTPUT_REPORT_PATH),
                                )
                            }
                        >
                            Reset filter
                        </Button>
                    </div>
                    {advancedOpen && (
                        <div
                            id="report-advanced-filters"
                            className="grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2 xl:grid-cols-4"
                        >
                            <div className="min-w-0 space-y-1">
                                <label
                                    htmlFor="report-process"
                                    className="text-xs font-medium"
                                >
                                    Proses
                                </label>
                                <select
                                    id="report-process"
                                    value={draft.process}
                                    onChange={(event) =>
                                        set({
                                            process: event.target
                                                .value as OutputReportFilter['process'],
                                        })
                                    }
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                    <option value="">Semua Proses</option>
                                    {Object.entries(PROCESS_LABELS).map(
                                        ([key, label]) => (
                                            <option key={key} value={key}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </div>
                            <SearchChoice
                                label="Produk"
                                value={draft.productVariantId}
                                options={options.products}
                                onChange={(id) =>
                                    set({ productVariantId: id })
                                }
                            />
                            <SearchChoice
                                label="Operator"
                                value={draft.operatorId}
                                options={options.operators}
                                onChange={(id) => set({ operatorId: id })}
                            />
                            <SearchChoice
                                label="Mesin"
                                value={draft.machineId}
                                options={options.machines}
                                onChange={(id) => set({ machineId: id })}
                            />
                            <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
                                Pilihan berasal dari riwayat periode, termasuk
                                barang setengah jadi dan data nonaktif/arsip.
                            </p>
                        </div>
                    )}
                </div>
            </fieldset>
            {error && (
                <p
                    role="alert"
                    className="border-t px-4 py-3 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
        </form>
    );
}
