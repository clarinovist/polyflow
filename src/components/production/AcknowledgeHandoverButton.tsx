"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClipboardCheck } from 'lucide-react';
import { acknowledgeHandover } from '@/actions/inventory';
import { toast } from 'sonner';

export function AcknowledgeHandoverButton({ movementId }: { movementId: string }) {
    const [loading, setLoading] = useState(false);

    const handleAck = async () => {
        if (!confirm('Acknowledge this handover and mark as received?')) return;
        setLoading(true);
        try {
            const res = await acknowledgeHandover(movementId);
            if (res.success) {
                toast.success('Handover acknowledged');
            } else {
                toast.error(res.error || 'Failed to acknowledge');
            }
        } catch (error) {
            console.error(error);
            toast.error('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button size="sm" className="text-xs" onClick={handleAck} disabled={loading}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Acknowledge
        </Button>
    );
}

export default AcknowledgeHandoverButton;
