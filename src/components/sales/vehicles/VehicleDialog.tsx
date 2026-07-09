'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createVehicleSchema, CreateVehicleValues } from '@/lib/schemas/sales';
import { createVehicle, updateVehicle } from '@/actions/sales/vehicles';
import { Vehicle, VehicleType, OwnershipType, VehicleStatus } from '@prisma/client';
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
import { Loader2, Plus, Car } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { salesLabels } from '@/lib/labels';

interface VehicleDialogProps {
  mode: 'create' | 'edit';
  initialData?: Vehicle;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  MOBIL_BOX: 'Mobil Box',
  L300: 'L300',
  COLD_CONTAINER: 'Cold Container',
  TRONTON: 'Tronton',
  MOTOR: 'Motor',
  OTHER: 'Lainnya',
};

export function VehicleDialog({ mode, initialData, trigger, open: externalOpen, onOpenChange }: VehicleDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const form = useForm<CreateVehicleValues>({
    // cast: z.coerce makes input type diverge from output (Zod 4 + RHF)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createVehicleSchema) as any,
    defaultValues: {
      plateNumber: initialData?.plateNumber || '',
      name: initialData?.name || '',
      vehicleType: (initialData?.vehicleType as VehicleType) || 'OTHER',
      ownershipType: (initialData?.ownershipType as OwnershipType) || 'PRIVATE',
      ownerName: initialData?.ownerName || '',
      driverName: initialData?.driverName || '',
      capacityKg: initialData?.capacityKg ? Number(initialData.capacityKg) : undefined,
      status: (initialData?.status as VehicleStatus) || 'ACTIVE',
      notes: initialData?.notes || '',
    },
  });

  const handleSubmit = async (values: CreateVehicleValues) => {
    setIsSubmitting(true);
    try {
      const result = mode === 'create'
        ? await createVehicle(values)
        : await updateVehicle(initialData!.id, values);

      if (!result.success) {
        const msg = result.error || '';
        if (msg.includes('Failed to find Server Action')) {
          toast.error('Halaman sudah kedaluwarsa karena deploy baru. Silakan refresh (F5) lalu coba lagi.', {
            duration: 10000,
            action: { label: 'Refresh', onClick: () => window.location.reload() },
          });
        } else {
          toast.error(msg || `Gagal ${mode === 'create' ? 'membuat' : 'mengupdate'} kendaraan.`);
        }
        return;
      }

      toast.success(`Kendaraan berhasil ${mode === 'create' ? 'dibuat' : 'diupdate'}.`);
      setOpen(false);
      form.reset();
      router.refresh();
    } catch {
      toast.error(`Gagal ${mode === 'create' ? 'membuat' : 'mengupdate'} kendaraan. Silakan coba lagi.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            {salesLabels.newVehicle}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-600" />
            {mode === 'create' ? salesLabels.newVehicle : 'Edit Kendaraan'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Tambahkan kendaraan baru ke dalam sistem.'
              : `Update data kendaraan ${initialData?.plateNumber || ''}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="plateNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.plateNumber} *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="B 1234 CD" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.vehicleName} *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Contoh: L300 Mas Joko" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.vehicleType}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownershipType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{salesLabels.ownershipType}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FACTORY">{salesLabels.factoryOwned}</SelectItem>
                        <SelectItem value="PRIVATE">{salesLabels.privateOwned}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ownerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Pemilik</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nama pemilik (jika perorangan)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="driverName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.driverName}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nama sopir utama" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacityKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{salesLabels.capacity}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === '' ? null : Number(val));
                      }}
                      placeholder="Contoh: 2000"
                      min={0}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catatan</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Catatan tambahan (opsional)" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : mode === 'create' ? 'Simpan' : 'Update'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
