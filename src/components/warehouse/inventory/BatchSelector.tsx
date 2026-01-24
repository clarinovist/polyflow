'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface BatchInfo {
    id: string;
    batchNumber: string;
    quantity: number;
    manufacturingDate: Date;
    expiryDate?: Date | null;
}

interface BatchSelectorProps {
    batches: BatchInfo[];
    selectedBatchId?: string;
    onSelect: (batchId: string) => void;
    placeholder?: string;
}

export function BatchSelector({ batches, selectedBatchId, onSelect, placeholder = "Select Batch (FIFO)" }: BatchSelectorProps) {
    // Sort batches: Oldest manufacturing date first (FIFO)
    const sortedBatches = [...batches].sort((a, b) =>
        new Date(a.manufacturingDate).getTime() - new Date(b.manufacturingDate).getTime()
    );

    return (
        <Select value={selectedBatchId} onValueChange={onSelect}>
            <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {sortedBatches.map((batch, index) => {
                    const isExpired = batch.expiryDate ? new Date(batch.expiryDate) < new Date() : false;
                    return (
                        <SelectItem key={batch.id} value={batch.id} disabled={isExpired}>
                            <div className="flex items-center justify-between gap-4 w-full">
                                <span className="font-mono font-medium">
                                    {batch.batchNumber}
                                    {index === 0 && <span className="ml-2 text-xs text-green-600 font-bold">(FIFO)</span>}
                                </span>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                    <span>Qty: {batch.quantity}</span>
                                    <span>{format(new Date(batch.manufacturingDate), 'MMM d')}</span>
                                    {isExpired && <Badge variant="destructive" className="h-4 px-1 text-[10px]">Exp</Badge>}
                                </div>
                            </div>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}
