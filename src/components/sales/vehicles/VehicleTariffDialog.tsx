'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createVehicleTariffSchema, CreateVehicleTariffValues } from '@/lib/schemas/sales';
import { createVehicleTariff, updateVehicleTariff } from '@/actions/sales/vehicle-tariffs';
import { VehicleTariff, RateType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, DollarSign } from 'lucide-react';
import { salesLabels } from '@/lib/labels';

interface VehicleTariffDialogProps {
  mode: 'create' | 'edit';
  vehicleId: string;
  initialData?: VehicleTariff;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VehicleTariffDialog({ mode, vehicleId, initialData, trigger, open: externalOpen, onOpenChange }: VehicleTariffDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const getDefaultValues = (): CreateVehicleTariffValues => {
    const now = new Date().toISOString().split('T')[0];
    return {
      vehicleId,
      rateType: (initialData?.rateType as RateType) || 'PER_KG',
      costRate: initialData?.costRate ? Number(initialData.costRate) : 0,
      chargeRate: initialData?.chargeRate ? Number(initialData.chargeRate) : 0,
      routeName: initialData?.routeName || '',
      minKg: initialData?.minKg ? Number(initialData.minKg) : undefined,
      validFrom: initialData?.validFrom ? new Date(initialData.validFrom as string | Date) : new Date(now),
      validUntil: initialData?.validUntil ? new Date(initialData.validUntil as string | Date) : undefined,
      notes: initialData?.notes || '',
    };
  };

  const form = useForm<CreateVehicleTariffValues>({
    // cast: z.coerce makes input type diverge from output (Zod 4 + RHF)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createVehicleTariffSchema) as any,
    defaultValues: getDefaultValues(),
  });

  const handleSubmit = async (values: CreateVehicleTariffValues) => {
    setIsSubmitting(true);
    try {
      const result = mode === 'create'
        ? await createVehicleTariff({ ...values, vehicleId })
        : await updateVehicleTariff(initialData!.id, { ...values, vehicleId });

      if (!result.success) {
        const msg = result.error || '';
        if (msg.includes('Failed to find Server Action')) {
          toast.error('Halaman sudah kedaluwarsa karena deploy baru. Silakan refresh (F5) lalu coba lagi.', {
            duration: 10000,
            action: { label: 'Refresh', onClick: () => window.location.reload() },
          });
        } else {
          toast.error(msg || `Gagal ${mode === 'create' ? 'menambahkan' : 'mengupdate'} tarif.`);
        }
        return;
      }

      toast.success(`Tarif berhasil ${mode === 'create' ? 'ditambahkan' : 'diupdate'}.`);
      setOpen(false);
      form.reset();
      router.refresh();
    } catch {
      toast.error(`Gagal ${mode === 'create' ? 'menambahkan' : 'mengupdate'} tarif. Silakan coba lagi.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {salesLabels.newTariff}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            {mode === 'create' ? salesLabels.newTariff : 'Edit Tarif'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Tambahkan tarif pengiriman untuk kendaraan ini.'
              : 'Update tarif pengiriman.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="rateType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.rateType} *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PER_KG">{salesLabels.perKg}</SelectItem>
                      <SelectItem value="FLAT_RATE">{salesLabels.flatRate}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="costRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.costRate} *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === '' ? null : Number(val));
                        }}
                        placeholder="Rp 0"
                        min={0}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chargeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.chargeRate} *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === '' ? null : Number(val));
                        }}
                        placeholder="Rp 0"
                        min={0}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="routeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.route}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="Contoh: Solo - Boyolali (Kosongkan untuk semua rute)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="minKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Kg</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === '' ? null : Number(val));
                      }}
                      placeholder="Opsional"
                      min={0}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="validFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.validFrom} *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validUntil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.validUntil}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
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
                  <FormLabel>Catatan</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Catatan tambahan (opsional)" rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : mode === 'create' ? 'Simpan Tarif' : 'Update Tarif'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
