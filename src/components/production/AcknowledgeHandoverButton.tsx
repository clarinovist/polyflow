"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClipboardCheck } from 'lucide-react';
import { acknowledgeHandover } from '@/actions/inventory/inventory';
import { toast } from 'sonner';
import { productionComponentLabels } from '@/lib/labels';

export function AcknowledgeHandoverButton({ movementId }: { movementId: string }) {
    const [loading, setLoading] = useState(false);

    const handleAck = async () => {
        if (!confirm('Konfirmasi serah terima ini dan tandai sebagai diterima?')) return;
        setLoading(true);
        try {
            const res = await acknowledgeHandover(movementId);
            if (res.success) {
                toast.success('Serah terima berhasil dikonfirmasi.');
            } else {
                toast.error(res.error || 'Gagal mengonfirmasi serah terima');
            }
        } catch (error) {
            console.error(error);
            toast.error('Terjadi kesalahan');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button size="sm" className="text-xs" onClick={handleAck} disabled={loading}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> {productionComponentLabels.acknowledge}
        </Button>
    );
}

export default AcknowledgeHandoverButton;
