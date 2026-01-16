'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { unlinkSupplierFromProduct } from '@/actions/supplier-product';

interface UnlinkProductButtonProps {
    id: string;
}

export function UnlinkProductButton({ id }: UnlinkProductButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    async function handleUnlink() {
        if (!confirm('Are you sure you want to unlink this product?')) return;

        setIsLoading(true);
        try {
            const result = await unlinkSupplierFromProduct(id);
            if (result.success) {
                toast.success('Product unlinked');
            } else {
                toast.error(result.error || 'Failed to unlink');
            }
        } catch (_error) {
            toast.error('An error occurred');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleUnlink}
            disabled={isLoading}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
    );
}
