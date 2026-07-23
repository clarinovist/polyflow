'use client';

import { useState } from 'react';
import { FinancialPurchaseInvoiceDetail } from '@/components/finance/invoices/FinancialPurchaseInvoiceDetail';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { EditPurchaseInvoiceDueDateDialog } from '@/components/purchasing/orders/EditPurchaseInvoiceDueDateDialog';
import type { PurchaseInvoiceStatus } from '@prisma/client';

type PurchaseInvoiceForClient = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string | null;
  termOfPaymentDays?: number | null;
  status: PurchaseInvoiceStatus;
  totalAmount: number | { toNumber: () => number };
  paidAmount: number | { toNumber: () => number };
  purchaseOrder: {
    orderNumber: string;
    supplier: { name: string };
    totalAmount: number | { toNumber: () => number };
    items?: unknown[];
  };
  payments?: unknown[];
};

export function FinancialPurchaseInvoicePageClient({ invoice }: { invoice: PurchaseInvoiceForClient }) {
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
