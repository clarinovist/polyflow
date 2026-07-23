'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { TransactionDateFilter } from '@/components/common/transaction-date-filter';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FilterOptions {
  machines: { id: string; code: string; name: string }[];
  operators: { id: string; name: string }[];
  shifts: { id: string; shiftName: string }[];
  products: { id: string; name: string }[];
}

interface ProductionHistoryFiltersProps {
  filterOptions: FilterOptions;
}

function SelectFilter({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string | null;
  options: { id: string; label: string }[];
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="h-9 rounded-md border border-input bg-background px-3 pr-7 text-xs appearance-none cursor-pointer hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{label}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
    </div>
  );
}

export function ProductionHistoryFilters({ filterOptions }: ProductionHistoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const q = searchParams.get('q') || '';
  const machineId = searchParams.get('machineId');
  const operatorId = searchParams.get('operatorId');
  const shiftId = searchParams.get('shiftId');
  const productVariantId = searchParams.get('productVariantId');
  const hasScrap = searchParams.get('hasScrap') === 'true';
  const missingPhoto = searchParams.get('missingPhoto') === 'true';
  const includeVoided = searchParams.get('includeVoided') === 'true';

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    router.push(`?${params.toString()}`);
  }

  function handleDateChange(range: { from?: Date; to?: Date } | undefined) {
    if (range?.from) {
      pushParams({
        from: range.from.toISOString(),
        to: range.to ? range.to.toISOString() : null,
      });
    } else {
      pushParams({ from: null, to: null });
    }
  }

  function handleSearch(value: string) {
    pushParams({ q: value || null });
  }

  function toggleFilter(key: string, current: boolean) {
    pushParams({ [key]: current ? null : 'true' });
  }

  const activeFilterCount = [hasScrap, missingPhoto, includeVoided, machineId, operatorId, shiftId, productVariantId].filter(Boolean).length + (q ? 1 : 0);

  // Derive date range for TransactionDateFilter
  const dateRange = from && to
    ? { from: new Date(from), to: new Date(to) }
    : from
    ? { from: new Date(from), to: undefined }
    : undefined;

  return (
    <div className="space-y-3">
      {/* Row 1: Date + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <TransactionDateFilter
          date={dateRange}
          onDateChange={handleDateChange}
          defaultPreset={!dateRange ? 'today' : undefined}
          showAll={true}
          align="start"
        />

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari SPK / produk / notes…"
            defaultValue={q}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch((e.target as HTMLInputElement).value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== q) {
                handleSearch(e.target.value);
              }
            }}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={hasScrap ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => toggleFilter('hasScrap', hasScrap)}
          >
            Ada scrap
            {hasScrap && <X className="ml-1 h-3 w-3" />}
          </Button>
          <Button
            variant={missingPhoto ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => toggleFilter('missingPhoto', missingPhoto)}
          >
            Tanpa foto
            {missingPhoto && <X className="ml-1 h-3 w-3" />}
          </Button>
          <Button
            variant={includeVoided ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => toggleFilter('includeVoided', includeVoided)}
          >
            Voided
            {includeVoided && <X className="ml-1 h-3 w-3" />}
          </Button>
        </div>

        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
            {activeFilterCount} filter aktif
          </Badge>
        )}
      </div>

      {/* Row 2: Dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          label="Semua Mesin"
          value={machineId}
          options={filterOptions.machines.map(m => ({ id: m.id, label: `${m.code} — ${m.name}` }))}
          onSelect={(id) => pushParams({ machineId: id })}
        />
        <SelectFilter
          label="Semua Operator"
          value={operatorId}
          options={filterOptions.operators.map(o => ({ id: o.id, label: o.name }))}
          onSelect={(id) => pushParams({ operatorId: id })}
        />
        <SelectFilter
          label="Semua Shift"
          value={shiftId}
          options={filterOptions.shifts.map(s => ({ id: s.id, label: s.shiftName }))}
          onSelect={(id) => pushParams({ shiftId: id })}
        />
        <SelectFilter
          label="Semua Produk"
          value={productVariantId}
          options={filterOptions.products.map(p => ({ id: p.id, label: p.name }))}
          onSelect={(id) => pushParams({ productVariantId: id })}
        />
      </div>
    </div>
  );
}
