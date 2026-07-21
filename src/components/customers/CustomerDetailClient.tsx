"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Mail,
  DollarSign,
  Percent,
  History,
  Navigation,
  ImageIcon,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils/utils";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { SalesOrderTable } from "@/components/sales/SalesOrderTable";
import { CustomerProductPricesManager } from "@/components/customers/CustomerProductPricesManager";
import { CustomerInvoicesTab } from "./360/CustomerInvoicesTab";
import { CustomerReturnsTab } from "./360/CustomerReturnsTab";
import { CustomerDeliveriesTab } from "./360/CustomerDeliveriesTab";
import { CustomerQuotationsTab } from "./360/CustomerQuotationsTab";
import { CustomerVisitsTab } from "./360/CustomerVisitsTab";
import { CustomerAnalyticsTab } from "./360/CustomerAnalyticsTab";

import { Customer, SalesOrder, Location, Product, ProductVariant } from "@prisma/client";

export type SerializedCustomer = Omit<
  Customer,
  "creditLimit" | "discountPercent" | "latitude" | "longitude"
> & {
  creditLimit: number | null;
  discountPercent: number | null;
  latitude: number | null;
  longitude: number | null;
};

type SerializedSalesOrder = Omit<SalesOrder, "totalAmount"> & {
  totalAmount: number | null;
  customer: SerializedCustomer | null;
  sourceLocation: Location | null;
  _count: { items: number };
};

type SerializedProductVariant = Omit<
  ProductVariant,
  | "price"
  | "buyPrice"
  | "sellPrice"
  | "conversionFactor"
  | "minStockAlert"
  | "reorderPoint"
  | "reorderQuantity"
  | "standardCost"
> & {
  price: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  conversionFactor: number;
  minStockAlert: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  standardCost: number | null;
  product: Product;
};

type SerializedCustomerProductPrice = {
  id: string;
  customerId: string;
  productVariantId: string;
  unitPrice: number;
  isActive: boolean;
  notes: string | null;
  productVariant: SerializedProductVariant;
};

interface CustomerDetailClientProps {
  customer: SerializedCustomer;
  salesOrders: SerializedSalesOrder[];
  customerProductPrices: SerializedCustomerProductPrice[];
  products: SerializedProductVariant[];
}

export function CustomerDetailClient({
  customer,
  salesOrders,
  customerProductPrices,
  products,
}: CustomerDetailClientProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/sales/customers">
            <Button variant="outline" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {customer.name}
            </h1>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline">{customer.code || "No Code"}</Badge>
              <Badge variant={customer.isActive ? "default" : "secondary"}>
                {customer.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>
        <CustomerDialog
          mode="edit"
          initialData={{
            ...customer,
            creditLimit: customer.creditLimit
              ? Number(customer.creditLimit)
              : null,
            discountPercent: customer.discountPercent
              ? Number(customer.discountPercent)
              : null,
            latitude: customer.latitude ? Number(customer.latitude) : null,
            longitude: customer.longitude ? Number(customer.longitude) : null,
          }}
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto gap-1 overflow-x-auto scrollbar-none justify-start">
          <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>
          <TabsTrigger value="history" className="shrink-0">Sales</TabsTrigger>
          <TabsTrigger value="invoices" className="shrink-0">Invoices</TabsTrigger>
          <TabsTrigger value="returns" className="shrink-0">Retur</TabsTrigger>
          <TabsTrigger value="deliveries" className="shrink-0">Kirim</TabsTrigger>
          <TabsTrigger value="quotations" className="shrink-0">Quotations</TabsTrigger>
          <TabsTrigger value="prices" className="shrink-0">Harga</TabsTrigger>
          <TabsTrigger value="visits" className="shrink-0">Kunjungan</TabsTrigger>
          <TabsTrigger value="analytics" className="shrink-0">Analitik</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Contact Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {customer.email && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-sm break-all">
                        {customer.email}
                      </p>
                    </div>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{customer.phone}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Addresses & Location Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Alamat & Lokasi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Structured Address */}
                {(customer.province ||
                  customer.city ||
                  customer.district ||
                  customer.village) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Alamat Terstruktur
                    </p>
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
                  </div>
                )}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 first:border-0 first:pt-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    Billing Address
                  </p>
                  <p className="text-sm">{customer.billingAddress || "-"}</p>
                </div>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-xs text-muted-foreground mb-1">
                    Shipping Address
                  </p>
                  <p className="text-sm">{customer.shippingAddress || "-"}</p>
                </div>

                {/* GPS Coordinates */}
                {customer.latitude && customer.longitude && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-muted-foreground mb-1">
                      Koordinat
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">
                        {Number(customer.latitude).toFixed(6)},{" "}
                        {Number(customer.longitude).toFixed(6)}
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Navigation className="h-3 w-3" />
                        Navigasi
                      </a>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Store Photo Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Foto Toko
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customer.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={customer.photoUrl}
                    alt={`Foto toko ${customer.name}`}
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                ) : (
                  <div className="w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Belum ada foto</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financials & Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Financial Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tax ID</p>
                    <p className="font-medium">{customer.taxId || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Payment Terms
                    </p>
                    <p className="font-medium">
                      {customer.paymentTermDays
                        ? `${customer.paymentTermDays} Days`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Credit Limit
                    </p>
                    <p className="font-medium">
                      {customer.creditLimit ? formatRupiah(customer.creditLimit) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Percent className="w-3 h-3" /> Discount
                    </p>
                    <p className="font-medium">
                      {customer.discountPercent
                        ? `${customer.discountPercent}%`
                        : "-"}
                    </p>
                  </div>
                </div>
                {customer.notes && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm italic">{customer.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Sales History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SalesOrderTable initialData={salesOrders} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <CustomerInvoicesTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <CustomerReturnsTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="deliveries" className="mt-4">
          <CustomerDeliveriesTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="quotations" className="mt-4">
          <CustomerQuotationsTab customerId={customer.id} />
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tags className="h-5 w-5" />
                Harga Produk Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerProductPricesManager
                customerId={customer.id}
                prices={customerProductPrices}
                products={products}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits" className="mt-4">
          <CustomerVisitsTab customerId={customer.id} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <CustomerAnalyticsTab customerId={customer.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
