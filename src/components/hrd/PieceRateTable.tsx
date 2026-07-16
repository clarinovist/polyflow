'use client';

import { useState, useTransition } from 'react';
import { MachineType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { upsertProcessPieceRate } from '@/actions/hrd/piece-rates';
import { toast } from 'sonner';

type RateRow = {
  id: string | null;
  machineType: MachineType;
  ratePerKg: number;
  status: string;
};

export function PieceRateTable({ initialRows }: { initialRows: RateRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();

  const updateLocal = (machineType: MachineType, patch: Partial<RateRow>) => {
    setRows((prev) => prev.map((r) => (r.machineType === machineType ? { ...r, ...patch } : r)));
  };

  const save = (row: RateRow) => {
    startTransition(async () => {
      const res = await upsertProcessPieceRate({
        machineType: row.machineType,
        ratePerKg: row.ratePerKg,
        status: row.ratePerKg > 0 ? 'ACTIVE' : 'INACTIVE',
      });
      if (res.success) {
        if (res.data) updateLocal(row.machineType, res.data);
        toast.success(`Tarif ${row.machineType} disimpan`);
      } else {
        toast.error(res.error || 'Gagal menyimpan');
      }
    });
  };

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="p-3 font-medium">Tipe mesin</th>
            <th className="p-3 font-medium">Rate / kg (IDR)</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium w-28"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.machineType} className="border-t">
              <td className="p-3 font-medium">{row.machineType}</td>
              <td className="p-3">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={row.ratePerKg}
                  onChange={(e) =>
                    updateLocal(row.machineType, {
                      ratePerKg: Number(e.target.value.replace(',', '.')) || 0,
                    })
                  }
                  className="max-w-[180px]"
                />
              </td>
              <td className="p-3">
                <span className={row.status === 'ACTIVE' && row.ratePerKg > 0 ? 'text-green-600' : 'text-muted-foreground'}>
                  {row.ratePerKg > 0 ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </td>
              <td className="p-3">
                <Button size="sm" disabled={pending} onClick={() => save(row)}>
                  Simpan
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
