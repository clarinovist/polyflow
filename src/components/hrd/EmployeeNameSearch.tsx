'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, User } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import type { KioskEmployeeOption } from '@/actions/admin/attendance';

interface Props {
  employees: KioskEmployeeOption[];
  selected: KioskEmployeeOption | null;
  onSelect: (emp: KioskEmployeeOption | null) => void;
  disabled?: boolean;
}

const MAX_RESULTS = 8;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rankMatch(emp: KioskEmployeeOption, q: string): number {
  const name = normalize(emp.name);
  const code = normalize(emp.code);
  if (!q) return 0;
  if (name.startsWith(q) || code.startsWith(q)) return 2;
  if (name.includes(q) || code.includes(q)) return 1;
  return 0;
}

export function EmployeeNameSearch({ employees, selected, onSelect, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query);
    if (q.length < 1) return [];
    return employees
      .map((e) => ({ e, rank: rankMatch(e, q) }))
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.e.name.localeCompare(b.e.name, 'id'))
      .slice(0, MAX_RESULTS)
      .map((x) => x.e);
  }, [employees, query]);

  if (selected) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
          Karyawan
        </label>
        <div className="flex items-center gap-2 h-14 px-3 rounded-md border-2 bg-primary/5 border-primary/30">
          <User className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{selected.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{selected.code}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            disabled={disabled}
            onClick={() => {
              onSelect(null);
              setQuery('');
              setOpen(false);
            }}
            aria-label="Ganti karyawan"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 relative" ref={wrapRef}>
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
        Cari Nama Karyawan
      </label>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Ketik nama… (contoh: Budi)"
        className="h-14 text-lg font-bold"
        autoComplete="off"
        autoFocus
        disabled={disabled}
      />
      {open && query.trim().length > 0 && (
        <ul
          className={cn(
            'absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border-2 bg-card shadow-lg',
          )}
          role="listbox"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">Tidak ada yang cocok</li>
          ) : (
            results.map((emp) => (
              <li key={emp.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full text-left px-4 py-3 hover:bg-muted/80 border-b border-border/40 last:border-0 transition-colors"
                  onClick={() => {
                    onSelect(emp);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <span className="font-bold block">{emp.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{emp.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
