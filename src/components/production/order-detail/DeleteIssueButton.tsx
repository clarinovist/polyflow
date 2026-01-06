import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteMaterialIssue } from '@/actions/production';

export function DeleteIssueButton({ issueId, orderId }: { issueId: string, orderId: string }) {
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!confirm("Are you sure? This will refund the stock to Raw Material Warehouse.")) return;

        setLoading(true);
        const result = await deleteMaterialIssue(issueId, orderId);
        if (result.success) {
            toast.success("Material issue voided and stock refunded.");
        } else {
            toast.error(result.error);
        }
        setLoading(false);
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-red-600"
            onClick={handleDelete}
            disabled={loading}
            title="Void / Delete Issue"
        >
            <Trash2 className="w-4 h-4" />
        </Button>
    )
}
