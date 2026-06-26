"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Phone,
  MapPin,
  ChevronRight,
  Users,
  Navigation,
} from "lucide-react";
import Link from "next/link";

type Customer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  photoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  isActive: boolean;
};

interface CustomerListClientProps {
  customers: Customer[];
}

export function CustomerListClient({ customers }: CustomerListClientProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.phone?.includes(q),
    );
  }, [customers, search]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Customer</h1>
        <p className="text-sm text-muted-foreground">Daftar outlet</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Customer List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Customer tidak ditemukan" : "Belum ada customer"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => (
            <Link
              key={customer.id}
              href={`/sales/mobile/customers/${customer.id}`}
              className="block p-3 border rounded-xl active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                {customer.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={customer.photoUrl}
                    alt={customer.name}
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm truncate">
                      {customer.name}
                    </h3>
                    {!customer.isActive && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
                      >
                        Non-aktif
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {customer.code || "-"}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {customer.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </span>
                    )}
                    {customer.city && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {customer.city}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {customer.latitude && customer.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Navigation className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </a>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
