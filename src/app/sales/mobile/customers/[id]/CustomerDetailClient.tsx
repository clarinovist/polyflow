"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Navigation,
  Plus,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";
import { VisitCheckInCard } from "@/components/sales/mobile/VisitCheckInCard";

type Customer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  creditLimit: number | null;
  paymentTermDays: number | null;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  isActive: boolean;
};

type Order = {
  id: string;
  orderNumber: string;
  totalAmount: number | null;
  status: string;
  orderDate: Date | string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string | null;
  totalAmount: number;
  paidAmount: number;
  status: string;
  orderNumber: string;
};

interface CustomerDetailClientProps {
  customer: Customer;
  recentOrders: Order[];
  outstandingInvoices: Invoice[];
}

export function CustomerDetailClient({
  customer,
  recentOrders,
  outstandingInvoices,
}: CustomerDetailClientProps) {
  const router = useRouter();

  const totalOutstanding = outstandingInvoices.reduce(
    (sum, inv) => sum + (inv.totalAmount - inv.paidAmount),
    0
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{customer.name}</h1>
          <p className="text-xs text-muted-foreground">
            {customer.code || "-"}
          </p>
        </div>
        {!customer.isActive && (
          <Badge variant="secondary" className="shrink-0">
            Non-aktif
          </Badge>
        )}
      </div>

      {/* Photo */}
      {customer.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customer.photoUrl}
          alt={customer.name}
          className="w-full h-48 object-cover rounded-xl"
        />
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="flex flex-col items-center gap-1 p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl active:scale-95 transition-transform"
          >
            <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium">Telepon</span>
          </a>
        )}
        {customer.latitude && customer.longitude && (
          <a
            href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl active:scale-95 transition-transform"
          >
            <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium">Navigasi</span>
          </a>
        )}
        <Link
          href={`/sales/mobile/orders/create?customer=${customer.id}`}
          className="flex flex-col items-center gap-1 p-3 bg-primary/10 rounded-xl active:scale-95 transition-transform"
        >
          <Plus className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Order Baru</span>
        </Link>
      </div>

      {/* Geolocation Check-in Card */}
      <VisitCheckInCard
        customerId={customer.id}
        customerName={customer.name}
        targetLatitude={customer.latitude}
        targetLongitude={customer.longitude}
      />

      {/* Address */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Alamat</h3>
        </div>
        {(customer.province || customer.city || customer.district) && (
          <p className="text-sm">
            {[
              customer.village,
              customer.district,
              customer.city,
              customer.province,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {customer.billingAddress && (
          <p className="text-xs text-muted-foreground">
            {customer.billingAddress}
          </p>
        )}
      </div>

      {/* Financial Info */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Informasi Keuangan</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm border-b pb-3 mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Credit Limit</p>
            <p className="font-medium">
              {customer.creditLimit ? formatRupiah(customer.creditLimit) : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payment Term</p>
            <p className="font-medium">
              {customer.paymentTermDays
                ? `${customer.paymentTermDays} hari`
                : "-"}
            </p>
          </div>
        </div>
        <div className="flex justify-between items-center text-sm pt-1">
          <p className="text-xs text-muted-foreground">Total Piutang Outstanding</p>
          <p className={`font-bold text-sm ${totalOutstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatRupiah(totalOutstanding)}
          </p>
        </div>
      </div>

      {/* Outstanding Invoices */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center justify-between">
          <span>Piutang & Faktur Outstanding</span>
          {outstandingInvoices.length > 0 && (
            <Badge variant="destructive" className="text-[10px] font-bold">
              {outstandingInvoices.length} Faktur
            </Badge>
          )}
        </h3>
        {outstandingInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border rounded-xl bg-muted/10">
            Tidak ada piutang outstanding
          </p>
        ) : (
          <div className="space-y-2.5">
            {outstandingInvoices.map((inv) => {
              const remaining = inv.totalAmount - inv.paidAmount;
              const isOverdue = inv.status === "OVERDUE" || (inv.dueDate && new Date(inv.dueDate) < new Date());
              return (
                <div
                  key={inv.id}
                  className="p-3 border rounded-xl bg-card space-y-2 shadow-sm"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{inv.invoiceNumber}</p>
                      <p className="text-[10px] text-muted-foreground">Order: {inv.orderNumber}</p>
                    </div>
                    <Badge
                      variant={isOverdue ? "destructive" : "secondary"}
                      className="text-[10px] uppercase font-bold px-2 py-0.5"
                    >
                      {isOverdue ? "Overdue" : inv.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Jatuh Tempo</p>
                      <p className={`font-medium ${isOverdue ? "text-destructive font-semibold" : "text-foreground"}`}>
                        {inv.dueDate ? format(new Date(inv.dueDate), "dd MMM yyyy") : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Sisa Piutang</p>
                      <p className="font-bold text-rose-600 dark:text-rose-400">
                        {formatRupiah(remaining)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Order Terakhir</h3>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Belum ada order
          </p>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/sales/mobile/orders/${order.id}`}
                className="block p-3 border rounded-lg active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(order.orderDate), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {order.totalAmount
                        ? formatRupiah(order.totalAmount)
                        : "-"}
                    </p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">
                      {order.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

