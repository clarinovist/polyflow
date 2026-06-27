"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { formatRupiah } from "@/lib/utils/utils";
import {
  getMobileStatusColor,
  getMobileStatusLabel,
  filterOrders,
  STATUS_OPTIONS,
  type StatusFilter,
  type MobileOrder,
} from "../lib/status-helpers";

interface OrderListClientProps {
  orders: MobileOrder[];
}

export function OrderListClient({ orders }: OrderListClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered = useMemo(
    () => filterOrders(orders, search, statusFilter),
    [orders, search, statusFilter],
  );

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Order</h1>
        <p className="text-sm text-muted-foreground">{orders.length} order</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari no order atau customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Status Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Order List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "ALL"
              ? "Order tidak ditemukan"
              : "Belum ada order"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <Link
              key={order.id}
              href={`/sales/mobile/orders/${order.id}`}
              className="block p-3 border rounded-xl active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">{order.orderNumber}</h3>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 h-4 ${getMobileStatusColor(order.status)}`}
                    >
                      {getMobileStatusLabel(order.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.customerName} •{" "}
                    {format(new Date(order.orderDate), "d MMM yyyy")}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {order.itemCount} item
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      {order.totalAmount
                        ? formatRupiah(order.totalAmount)
                        : "-"}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
