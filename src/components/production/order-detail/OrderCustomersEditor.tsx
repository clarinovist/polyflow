'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { OrderCustomerPicker } from '../OrderCustomerPicker';
import { saveOrderCustomers } from '@/actions/production/order-customers';
import type { CustomerDestination } from '@/lib/production/order-context';

export function OrderCustomersEditor({ orderId, customers, selected }: {
    orderId: string;
    customers: CustomerDestination[];
    selected: CustomerDestination[];
}) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [value, setValue] = useState(selected.map((c) => c.id));
    const router = useRouter();
    const options = [...new Map([...customers, ...selected].map((c) => [c.id, c])).values()];
    const save = async () => {
        setPending(true);
        try {
            const result = await saveOrderCustomers({ orderId, customerIds: value });
            if (!result.success) { toast.error(result.error || 'Gagal menyimpan customer'); return; }
            toast.success('Customer tujuan diperbarui');
            setOpen(false);
            router.refresh();
        } catch { toast.error('Gagal menyimpan customer. Silakan coba lagi.'); }
        finally { setPending(false); }
    };
    return (
        <Dialog open={open} onOpenChange={(next) => {
            if (pending) return;
            if (next) setValue(selected.map((c) => c.id));
            setOpen(next);
        }}>
            <DialogTrigger asChild><Button variant="outline" size="sm">Atur customer tujuan</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Customer tujuan SPK</DialogTitle>
                    <DialogDescription>Pilih customer tambahan. Mengosongkan pilihan tidak menghapus customer dari SO/maklon.</DialogDescription>
                </DialogHeader>
                <OrderCustomerPicker customers={options} value={value} onChange={setValue} disabled={pending} />
                <Button onClick={save} disabled={pending || value.length > 100}>{pending ? 'Menyimpan…' : 'Simpan customer'}</Button>
                {value.length > 100 && <p role="alert">Maksimal 100 customer.</p>}
            </DialogContent>
        </Dialog>
    );
}
