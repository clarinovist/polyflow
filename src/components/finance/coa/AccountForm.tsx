'use client';

import { useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Account, AccountType, AccountCategory } from '@prisma/client';
import { upsertAccount } from '@/actions/finance/account-actions';
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
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

const accountSchema = z.object({
    code: z.string().min(1, 'Code is required'),
    name: z.string().min(1, 'Name is required'),
    type: z.nativeEnum(AccountType),
    category: z.nativeEnum(AccountCategory),
    description: z.string().optional(),
    isCashAccount: z.boolean().default(false),
    parentId: z.string().optional().nullable(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

interface AccountFormProps {
    account?: Account;
    parentOptions: { id: string; name: string; code: string }[];
    trigger?: React.ReactNode;
}

export function AccountForm({
    account,
    parentOptions,
    trigger,
}: AccountFormProps) {
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const form = useForm<AccountFormValues>({
        resolver: zodResolver(accountSchema) as Resolver<AccountFormValues>,
        defaultValues: {
            code: account?.code || '',
            name: account?.name || '',
            type: account?.type || 'ASSET',
            category: account?.category || 'CURRENT_ASSET',
            description: account?.description || '',
            isCashAccount: account?.isCashAccount || false,
            parentId: account?.parentId || null,
        },
    });

    const onSubmit = (values: AccountFormValues) => {
        startTransition(async () => {
            try {
                await upsertAccount({
                    id: account?.id,
                    ...values,
                    parentId:
                        values.parentId === 'null' || !values.parentId
                            ? null
                            : values.parentId,
                });
                toast.success(
                    account
                        ? 'Akun berhasil diperbarui.'
                        : 'Akun berhasil dibuat.',
                );
                setOpen(false);
                router.refresh();
                if (!account) form.reset();
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : 'Gagal menyimpan akun',
                );
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Tambah Akun
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {account ? 'Ubah Akun' : 'Akun Baru'}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4"
                    >
                        <FormField
                            control={form.control}
                            name="code"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Kode Akun</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="mis. 1001"
                                            {...field}
                                        />
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
                                    <FormLabel>Nama Akun</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="mis. Kas di Tangan"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Jenis</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih jenis" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Object.values(AccountType).map(
                                                    (type) => (
                                                        <SelectItem
                                                            key={type}
                                                            value={type}
                                                        >
                                                            {type}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="category"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Kategori</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih kategori" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Object.values(
                                                    AccountCategory,
                                                ).map((cat) => (
                                                    <SelectItem
                                                        key={cat}
                                                        value={cat}
                                                    >
                                                        {cat}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="parentId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Akun Induk</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value || undefined}
                                        value={field.value || undefined}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tidak ada (akun induk)" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="null">
                                                Tidak ada
                                            </SelectItem>{' '}
                                            {/* Handle null explicitly if generic doesn't support null */}
                                            {(parentOptions || []).map(
                                                (opt) => {
                                                    if (!opt) return null;
                                                    return (
                                                        <SelectItem
                                                            key={opt.id}
                                                            value={opt.id}
                                                        >
                                                            {opt.code} -{' '}
                                                            {opt.name}
                                                        </SelectItem>
                                                    );
                                                },
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="isCashAccount"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Akun Kas/Bank?
                                        </FormLabel>
                                        <FormDescription>
                                            Aktifkan untuk metode pembayaran.
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isPending}>
                                {isPending && (
                                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                                )}
                                Simpan Perubahan
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
