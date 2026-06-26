import { getCustomers, deleteCustomer } from "@/actions/sales/customer";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { DeleteButton } from "@/components/common/DeleteButton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, MapPin, Eye, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Customer } from "@prisma/client";
import { salesLabels } from "@/lib/labels";

export default async function CustomersPage() {
  const customersRes = await getCustomers();
  const customers =
    customersRes.success && customersRes.data ? customersRes.data : [];

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {salesLabels.allCustomers}
          </CardTitle>
          <CardDescription>{salesLabels.allCustomersDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop: Table view */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{salesLabels.code}</TableHead>
                  <TableHead>{salesLabels.name}</TableHead>
                  <TableHead>{salesLabels.phone}</TableHead>
                  <TableHead>{salesLabels.billingAddress}</TableHead>
                  <TableHead>{salesLabels.status}</TableHead>
                  <TableHead className="w-[120px] text-right">
                    {salesLabels.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-96 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Users className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg font-medium">
                            Tidak ada pelanggan ditemukan
                          </h3>
                          <p className="text-muted-foreground">
                            Mulai dengan membuat pelanggan baru.
                          </p>
                        </div>
                        <CustomerDialog
                          mode="create"
                          trigger={
                            <Button variant="outline" className="mt-4">
                              <Plus className="mr-2 h-4 w-4" />
                              {salesLabels.addCustomer}
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer: Customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium text-muted-foreground font-mono text-xs">
                        {customer.code || "-"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {customer.name}
                      </TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {customer.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm italic">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {customer.billingAddress ? (
                          <div
                            className="flex items-center gap-2"
                            title={customer.billingAddress}
                          >
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {customer.billingAddress}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm italic">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={customer.isActive ? "default" : "secondary"}
                        >
                          {customer.isActive
                            ? salesLabels.active
                            : salesLabels.inactive}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/sales/customers/${customer.id}`}>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
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
                              latitude: customer.latitude
                                ? Number(customer.latitude)
                                : null,
                              longitude: customer.longitude
                                ? Number(customer.longitude)
                                : null,
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
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden space-y-3">
            {customers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada pelanggan ditemukan.</p>
              </div>
            ) : (
              customers.map((customer: Customer) => (
                <Link
                  key={customer.id}
                  href={`/sales/customers/${customer.id}`}
                  className="block"
                >
                  <div className="border rounded-lg p-4 active:scale-[0.99] transition-transform">
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
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm truncate">
                              {customer.name}
                            </h3>
                            <p className="text-xs text-muted-foreground font-mono">
                              {customer.code || "-"}
                            </p>
                          </div>
                          <Badge
                            variant={
                              customer.isActive ? "default" : "secondary"
                            }
                            className="text-[10px] shrink-0"
                          >
                            {customer.isActive
                              ? salesLabels.active
                              : salesLabels.inactive}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {customer.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </div>
                      )}
                      {customer.billingAddress && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">
                            {customer.billingAddress}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
