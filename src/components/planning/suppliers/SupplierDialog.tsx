'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createSupplierSchema, updateSupplierSchema, CreateSupplierValues, UpdateSupplierValues } from '@/lib/schemas/partner';
import { createSupplier, updateSupplier } from '@/actions/purchasing/supplier';
import { Supplier } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { purchasingLabels, actionLabels, formLabels } from '@/lib/labels';

interface SupplierDialogProps {
    mode: 'create' | 'edit';
    initialData?: Supplier;
    trigger?: React.ReactNode;
}

export function SupplierDialog({ mode, initialData, trigger }: SupplierDialogProps) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const form = useForm<CreateSupplierValues | UpdateSupplierValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(mode === 'create' ? createSupplierSchema : updateSupplierSchema) as any,
        defaultValues: mode === 'edit' && initialData ? {
            id: initialData.id,
            name: initialData.name,
            code: initialData.code || '',
            phone: initialData.phone || '',
            email: initialData.email || '',
            address: initialData.address || '',
            taxId: initialData.taxId || '',
            paymentTermDays: initialData.paymentTermDays || 0,
            bankName: initialData.bankName || '',
            bankAccount: initialData.bankAccount || '',
            notes: initialData.notes || '',
        } : {
            name: '',
            code: '',
            phone: '',
            email: '',
            address: '',
            taxId: '',
            paymentTermDays: 0,
            bankName: '',
            bankAccount: '',
            notes: '',
        },
    });

    async function onSubmit(data: CreateSupplierValues | UpdateSupplierValues) {
        const result = mode === 'create'
            ? await createSupplier(data as CreateSupplierValues)
            : await updateSupplier(data as UpdateSupplierValues);

        if (result.success) {
            toast.success(`Supplier berhasil ${mode === 'create' ? 'dibuat' : 'diperbarui'}`);
            setOpen(false);
            if (mode === 'create') form.reset();
            router.refresh();
        } else {
            toast.error(result.error || `Failed to ${mode} supplier`);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant={mode === 'create' ? 'default' : 'ghost'} size={mode === 'create' ? 'default' : 'icon'}>
                        {mode === 'create' ? (
                            <>
                                <Plus className="h-4 w-4 mr-2" />
                                Tambah Supplier
                            </>
                        ) : (
                            <Pencil className="h-4 w-4" />
                        )}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Tambah Supplier' : 'Edit Supplier'}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{formLabels.name} *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Nama Supplier" {...field} />
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
                                            <FormLabel>{purchasingLabels.supplierCode}</FormLabel>
                                            {mode === 'create' && (
                                                <span className="text-[0.8rem] text-muted-foreground">
                                                    (Otomatis dibuat jika kosong)
                                                </span>
                                            )}
                                        </div>
                                        <FormControl>
                                            <Input
                                                placeholder={mode === 'create' ? "Otomatis dibuat" : "SUP-XXX"}
                                                {...field}
                                                disabled={mode === 'edit'}
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
                                        <FormLabel>{formLabels.phone}</FormLabel>
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

                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{formLabels.address}</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Alamat Lengkap" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="taxId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{purchasingLabels.taxId}</FormLabel>
                                        <FormControl>
                                            <Input placeholder="" {...field} />
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
                                        <FormLabel>{purchasingLabels.paymentTermDays}</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="bankName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{purchasingLabels.bankName}</FormLabel>
                                        <FormControl>
                                            <Input placeholder="BCA" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="bankAccount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{purchasingLabels.bankAccount}</FormLabel>
                                    <FormControl>
                                        <Input placeholder="" {...field} />
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
                                    <FormLabel>{formLabels.notes}</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Catatan internal..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                {actionLabels.cancel}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {mode === 'create' ? 'Tambah Supplier' : 'Simpan Perubahan'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
