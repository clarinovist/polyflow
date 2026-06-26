"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createCustomerSchema,
  updateCustomerSchema,
  CreateCustomerValues,
  UpdateCustomerValues,
} from "@/lib/schemas/partner";
import { createCustomer, updateCustomer } from "@/actions/sales/customer";
import { Customer } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, MapPin, Navigation } from "lucide-react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/ui/file-upload";

type SerializedCustomer = Omit<
  Customer,
  "creditLimit" | "discountPercent" | "latitude" | "longitude"
> & {
  creditLimit: number | null;
  discountPercent: number | null;
  latitude: number | null;
  longitude: number | null;
};

interface CustomerDialogProps {
  mode: "create" | "edit";
  initialData?: SerializedCustomer;
  trigger?: React.ReactNode;
  /** Controlled open state — when provided, the dialog is controlled externally */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CustomerDialog({
  mode,
  initialData,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: CustomerDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = externalOnOpenChange ?? setInternalOpen;
  const [isLocating, setIsLocating] = useState(false);
  const router = useRouter();

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=id`,
        { headers: { "User-Agent": "PolyFlowERP/1.0" } },
      );
      const data = await res.json();
      if (data.address) {
        const a = data.address;
        if (a.state) form.setValue("province", a.state);
        if (a.city || a.town || a.county)
          form.setValue("city", a.city || a.town || a.county);
        if (a.suburb || a.district || a.village)
          form.setValue("district", a.suburb || a.district || a.village);
        if (a.village || a.hamlet || a.neighbourhood)
          form.setValue("village", a.village || a.hamlet || a.neighbourhood);
      }
    } catch {
      // Silent fail — GPS still works, just no address auto-fill
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Browser tidak mendukung geolocation");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        form.setValue("latitude", lat);
        form.setValue("longitude", lng);
        // Reverse geocode to auto-fill address fields
        reverseGeocode(lat, lng).then(() => {
          setIsLocating(false);
          toast.success("Lokasi & alamat berhasil diambil");
        });
      },
      () => {
        setIsLocating(false);
        toast.error("Gagal mengambil lokasi. Pastikan GPS aktif.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const form = useForm<CreateCustomerValues | UpdateCustomerValues>({
    resolver: zodResolver(
      mode === "create" ? createCustomerSchema : updateCustomerSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any,
    defaultValues:
      mode === "edit" && initialData
        ? {
            id: initialData.id,
            name: initialData.name,
            code: initialData.code || "",
            phone: initialData.phone || "",
            email: initialData.email || "",
            billingAddress: initialData.billingAddress || "",
            shippingAddress: initialData.shippingAddress || "",
            taxId: initialData.taxId || "",
            creditLimit: initialData.creditLimit
              ? Number(initialData.creditLimit)
              : 0,
            paymentTermDays: initialData.paymentTermDays || 0,
            discountPercent: initialData.discountPercent
              ? Number(initialData.discountPercent)
              : 0,
            notes: initialData.notes || "",
            latitude: initialData.latitude
              ? Number(initialData.latitude)
              : null,
            longitude: initialData.longitude
              ? Number(initialData.longitude)
              : null,
            photoUrl: initialData.photoUrl || null,
            province: initialData.province || "",
            city: initialData.city || "",
            district: initialData.district || "",
            village: initialData.village || "",
          }
        : {
            name: "",
            code: "",
            phone: "",
            email: "",
            billingAddress: "",
            shippingAddress: "",
            taxId: "",
            creditLimit: 0,
            paymentTermDays: 0,
            discountPercent: 0,
            notes: "",
            latitude: null,
            longitude: null,
            photoUrl: null,
            province: "",
            city: "",
            district: "",
            village: "",
          },
  });

  async function onSubmit(data: CreateCustomerValues | UpdateCustomerValues) {
    const result =
      mode === "create"
        ? await createCustomer(data as CreateCustomerValues)
        : await updateCustomer(data as UpdateCustomerValues);

    if (result.success) {
      toast.success(
        `Customer berhasil ${mode === "create" ? "dibuat" : "diperbarui"}`,
      );
      setOpen(false);
      if (mode === "create") form.reset();
      router.refresh();
    } else {
      toast.error(
        result.error ||
          `Gagal ${mode === "create" ? "membuat" : "memperbarui"} customer.`,
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant={mode === "create" ? "default" : "ghost"}
            size={mode === "create" ? "default" : "icon"}
          >
            {mode === "create" ? (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </>
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Customer" : "Edit Customer"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Customer Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center">
                      <FormLabel>Code</FormLabel>
                      {mode === "create" && (
                        <span className="text-[0.8rem] text-muted-foreground">
                          (Auto-generated if empty)
                        </span>
                      )}
                    </div>
                    <FormControl>
                      <Input
                        placeholder={
                          mode === "create" ? "Auto-generated" : "CUS-XXX"
                        }
                        {...field}
                        disabled={mode === "edit"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+62..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Address..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shippingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Address..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax ID (NPWP)</FormLabel>
                    <FormControl>
                      <Input placeholder="" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="creditLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Limit</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentTermDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms (Days)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discountPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location Section */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lokasi & Foto
              </h4>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <FormField
                  control={form.control}
                  name="province"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provinsi</FormLabel>
                      <FormControl>
                        <Input placeholder="Jawa Barat" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kota/Kabupaten</FormLabel>
                      <FormControl>
                        <Input placeholder="Bandung" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <FormField
                  control={form.control}
                  name="district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kecamatan</FormLabel>
                      <FormControl>
                        <Input placeholder="Cinambo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="village"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kelurahan/Desa</FormLabel>
                      <FormControl>
                        <Input placeholder="Cimbu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="-6.9175"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          placeholder="107.6191"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={getCurrentLocation}
                disabled={isLocating}
                className="mb-4"
              >
                {isLocating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                {isLocating ? "Mengambil lokasi..." : "Ambil Lokasi Saya"}
              </Button>

              <FormField
                control={form.control}
                name="photoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Foto Toko</FormLabel>
                    <FormControl>
                      <FileUpload
                        value={field.value || undefined}
                        onChange={(url) => field.onChange(url)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {mode === "create" ? "Buat Pelanggan" : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
