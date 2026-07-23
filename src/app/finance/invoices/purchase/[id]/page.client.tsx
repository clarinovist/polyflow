'use client';

import { useState } from 'react';
import { FinancialPurchaseInvoiceDetail } from '@/components/finance/invoices/FinancialPurchaseInvoiceDetail';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { EditPurchaseInvoiceDueDateDialog } from '@/components/purchasing/orders/EditPurchaseInvoiceDueDateDialog';

export function FinancialPurchaseInvoicePageClient({ invoice }: { invoice: any }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/invoices/purchase">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Daftar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Purchase Invoice Detail</h1>
            <p className="text-sm text-muted-foreground">Financial View · Tempo diperbaiki dari supplier default</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <CalendarClock className="mr-2 h-4 w-4" /> Edit Jatuh Tempo
        </Button>
      </div>

      <FinancialPurchaseInvoiceDetail invoice={invoice} />

      <EditPurchaseInvoiceDueDateDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />
    </div>
  );
}
