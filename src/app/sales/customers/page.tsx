"use client";

import { useState, useEffect, useMemo } from "react";
import { getCustomersWithCreditSummaryAction, deleteCustomer } from "@/actions/sales/customer";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { DeleteButton } from "@/components/common/DeleteButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Phone, Search, X } from "lucide-react";
import Link from "next/link";
import { salesLabels } from "@/lib/labels";
import { formatRupiah } from "@/lib/utils/utils";
import { cn } from "@/lib/utils/utils";
import type { CustomerCreditSummary } from "@/services/sales/credit-service";
import { Loader2 } from "lucide-react";

type FilterType = "all" | "active" | "inactive" | "has_limit" | "over_limit";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerCreditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    getCustomersWithCreditSummaryAction().then((result) => {
      const data = result && typeof result === "object" && "data" in result
        ? (result as { data: CustomerCreditSummary[] | null }).data
        : null;
      setCustomers(data ?? []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = customers;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.code && c.code.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)),
      );
    }

    // Filter
    switch (filter) {
      case "active":
        list = list.filter((c) => c.isActive);
        break;
      case "inactive":
        list = list.filter((c) => !c.isActive);
        break;
      case "has_limit":
        list = list.filter((c) => c.creditLimit !== null && c.creditLimit > 0);
        break;
      case "over_limit":
        list = list.filter((c) => c.exposureStatus === "over");
        break;
    }

    return list;
  }, [customers, search, filter]);

  const filterButtons: { label: string; value: FilterType; count: number }[] = [
    { label: "Semua", value: "all", count: customers.length },
    { label: "Aktif", value: "active", count: customers.filter((c) => c.isActive).length },
    { label: "Nonaktif", value: "inactive", count: customers.filter((c) => !c.isActive).length },
    { label: "Punya Limit", value: "has_limit", count: customers.filter((c) => c.creditLimit !== null && c.creditLimit! > 0).length },
    { label: "Over Limit", value: "over_limit", count: customers.filter((c) => c.exposureStatus === "over").length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {salesLabels.customers}
          </h1>
          <p className="text-muted-foreground">{salesLabels.customersDesc}</p>
        </div>
        <CustomerDialog mode="create" />
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama, kode, atau telepon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((fb) => (
            <Button
              key={fb.value}
              variant={filter === fb.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(fb.value)}
              className="h-7 text-xs"
            >
              {fb.label}
              <span className="ml-1 text-muted-foreground">({fb.count})</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kota</TableHead>
                <TableHead className="text-center">TOP</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead className="text-right">Headroom</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px] text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Users className="h-8 w-8 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">
                        {search || filter !== "all"
                          ? "Tidak ada pelanggan yang cocok."
                          : "Tidak ada pelanggan ditemukan."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {customer.code || "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/sales/customers/${customer.id}`}
                        className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer.city || "-"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {customer.paymentTermDays != null ? `${customer.paymentTermDays} hari` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {customer.creditLimit != null ? formatRupiah(customer.creditLimit) : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {customer.headroom != null ? (
                        <span
                          className={cn(
                            customer.exposureStatus === "over" && "text-red-600 font-medium",
                            customer.exposureStatus === "near" && "text-amber-600 font-medium",
                          )}
                        >
                          {formatRupiah(customer.headroom)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={customer.isActive ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {customer.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                        {customer.exposureStatus === "over" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Over Limit
                          </Badge>
                        )}
                        {customer.exposureStatus === "near" && (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                            Mendekati Limit
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <CustomerDialog
                          mode="edit"
                          initialData={{
                            id: customer.id,
                            code: customer.code || "",
                            name: customer.name,
                            phone: customer.phone || "",
                            email: "",
                            billingAddress: "",
                            shippingAddress: "",
                            taxId: "",
                            creditLimit: customer.creditLimit,
                            paymentTermDays: customer.paymentTermDays || 0,
                            discountPercent: null,
                            notes: "",
                            latitude: null,
                            longitude: null,
                            photoUrl: null,
                            province: "",
                            city: customer.city || "",
                            district: "",
                            village: "",
                            defaultVehicleId: null,
                            isActive: customer.isActive,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                          }}
                        />
                        <DeleteButton
                          id={customer.id}
                          onDelete={deleteCustomer}
                          entityName="Customer"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Tidak ada pelanggan ditemukan.</p>
          </div>
        ) : (
          filtered.map((customer) => (
            <Link
              key={customer.id}
              href={`/sales/customers/${customer.id}`}
              className="block"
            >
              <div className="border rounded-lg p-4 active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {customer.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">
                      {customer.code || "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant={customer.isActive ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {customer.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                    {customer.exposureStatus === "over" && (
                      <Badge variant="destructive" className="text-[10px]">
                        Over
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {customer.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </div>
                  )}
                  {customer.city && (
                    <div>{customer.city}</div>
                  )}
                  {customer.creditLimit != null && (
                    <div className="flex justify-between">
                      <span>Limit: {formatRupiah(customer.creditLimit)}</span>
                      {customer.headroom != null && (
                        <span
                          className={cn(
                            customer.exposureStatus === "over" && "text-red-600 font-medium",
                            customer.exposureStatus === "near" && "text-amber-600 font-medium",
                          )}
                        >
                          Sisa: {formatRupiah(customer.headroom)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
