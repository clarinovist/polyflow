'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAYMENT_TERM_OPTIONS, calculateDueDate } from '@/lib/purchasing/payment-terms';
import { updatePurchaseInvoiceDueDate } from '@/actions/purchasing/purchasing';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    termOfPaymentDays?: number | null;
  };
}

export function EditPurchaseInvoiceDueDateDialog({ open, onOpenChange, invoice }: Props) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() =>
    new Date(invoice.invoiceDate).toISOString().slice(0, 10)
  );
  const [termDays, setTermDays] = useState<number>(invoice.termOfPaymentDays ?? 30);
  const [customTermDays, setCustomTermDays] = useState<string>('');
  const [useManualDue, setUseManualDue] = useState(false);
  const [manualDueDate, setManualDueDate] = useState(() =>
    invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : ''
  );

  const computedDueDate = useMemo(() => {
    if (useManualDue && manualDueDate) return new Date(manualDueDate);
    const inv = invoiceDate ? new Date(invoiceDate) : new Date(invoice.invoiceDate);
    const t = termDays === -1 ? parseInt(customTermDays || '0', 10) || 0 : termDays;
    return calculateDueDate(inv, t);
  }, [invoiceDate, termDays, customTermDays, useManualDue, manualDueDate, invoice.invoiceDate]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const finalTerm = termDays === -1 ? parseInt(customTermDays || '0', 10) || 0 : termDays;
      const payload: { dueDate?: Date; termOfPaymentDays?: number; invoiceDate?: Date } = {};
      if (useManualDue && manualDueDate) {
        payload.dueDate = new Date(manualDueDate);
        payload.termOfPaymentDays = finalTerm;
        payload.invoiceDate = new Date(invoiceDate);
      } else {
        payload.dueDate = computedDueDate;
        payload.termOfPaymentDays = finalTerm;
        payload.invoiceDate = new Date(invoiceDate);
      }

      const res = await updatePurchaseInvoiceDueDate(invoice.id, payload as never);
      if (res.success) {
        toast.success(`Jatuh tempo diperbarui → ${format(computedDueDate, 'dd MMM yyyy')}`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Gagal memperbarui jatuh tempo');
      }
    } catch {
      toast.error('Gagal memperbarui');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Jatuh Tempo — {invoice.invoiceNumber}</DialogTitle>
          <DialogDescription>
            Perbaiki tempo & jatuh tempo tanpa mengubah data lain. Invoice lama tidak otomatis diubah sebelumnya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tanggal Invoice</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tempo Saat Ini</Label>
              <div className="text-sm py-2 font-medium">{invoice.termOfPaymentDays ?? 30} hari</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tempo Baru</Label>
            <Select value={String(termDays)} onValueChange={(v) => setTermDays(parseInt(v, 10))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
                <SelectItem value="-1">Custom...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {termDays === -1 && (
            <div className="space-y-1.5">
              <Label>Custom Tempo (hari)</Label>
              <Input type="number" min={0} max={365} value={customTermDays} onChange={(e) => setCustomTermDays(e.target.value)} placeholder="Misal 21" />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input id="manual-due-edit" type="checkbox" checked={useManualDue} onChange={(e) => setUseManualDue(e.target.checked)} className="h-4 w-4" />
            <Label htmlFor="manual-due-edit" className="cursor-pointer">Input tanggal jatuh tempo manual</Label>
          </div>

          {useManualDue && (
            <div className="space-y-1.5">
              <Label>Jatuh Tempo Manual</Label>
              <Input type="date" value={manualDueDate} onChange={(e) => setManualDueDate(e.target.value)} />
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="text-muted-foreground">Preview Jatuh Tempo:</div>
            <div className="font-bold text-base mt-1">{format(computedDueDate, 'dd MMM yyyy')}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Invoice {invoiceDate ? format(new Date(invoiceDate), 'dd MMM yyyy') : '-'} + {useManualDue ? 'Manual' : `${termDays === -1 ? customTermDays || 0 : termDays} hari`}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={isLoading}>{isLoading ? 'Menyimpan...' : 'Simpan Jatuh Tempo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
