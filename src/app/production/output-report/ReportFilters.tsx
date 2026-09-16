'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Check } from 'lucide-react';
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
    const [error, setError] = useState('');
    const [pending, startTransition] = useTransition();
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
            onSubmit={(e) => {
                e.preventDefault();
                apply();
            }}
            className="rounded-xl border bg-card p-4 space-y-4"
            aria-label="Filter rekap produksi"
            aria-busy={pending}
        >
            <fieldset disabled={pending} className="space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                            onChange={(e) => set({ from: e.target.value })}
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
                            onChange={(e) => set({ to: e.target.value })}
                            className="h-11"
                        />
                    </div>
                    <div className="space-y-1">
                        <label
                            htmlFor="report-process"
                            className="text-xs font-medium"
                        >
                            Proses
                        </label>
                        <select
                            id="report-process"
                            value={draft.process}
                            onChange={(e) =>
                                set({
                                    process: e.target
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
                            onChange={(e) => set({ q: e.target.value })}
                            placeholder="Ketik nama atau SKU…"
                            className="h-11"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <SearchChoice
                        label="Produk"
                        value={draft.productVariantId}
                        options={options.products}
                        onChange={(id) => set({ productVariantId: id })}
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
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" className="h-11">
                        {pending ? 'Memuat…' : 'Terapkan'}
                    </Button>
                    {reportPresets(today).map((preset) => (
                        <Button
                            key={preset.label}
                            type="button"
                            variant="outline"
                            className="h-11"
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
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-11"
                        onClick={() =>
                            startTransition(() =>
                                router.push(OUTPUT_REPORT_PATH),
                            )
                        }
                    >
                        Reset filter
                    </Button>
                </div>
            </fieldset>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                Maksimal 366 hari. Pilihan berasal dari riwayat periode,
                termasuk barang setengah jadi dan data nonaktif/arsip.
            </p>
        </form>
    );
}
