'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// Map specific types for better readability if needed
const TYPE_LABELS: Record<string, string> = {
    RAW_MATERIAL: 'Raw Material',
    INTERMEDIATE: 'Intermediate/WIP',
    PACKAGING: 'Packaging',
    WIP: 'WIP (Work In Progress)', // Redundant with Intermediate but kept for completeness
    FINISHED_GOOD: 'Finished Good',
    SCRAP: 'Scrap/Waste',
};

// Available types from Prisma Enum (can be imported, or hardcoded for simple client component)
// Ideally we pass this as props, but hardcoding critical business enums here for simplicity is okay
const PRODUCT_TYPES = [
    'RAW_MATERIAL',
    'INTERMEDIATE',
    'PACKAGING',
    'FINISHED_GOOD',
    'SCRAP',
];

export function ProductTypeFilter() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentType = searchParams.get('type') || 'all';

    const handleTypeChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'all') {
            params.delete('type');
        } else {
            params.set('type', value);
        }
        const url = `/dashboard/products?${params.toString()}`;
        router.push(url);
        router.refresh(); // Force server data refresh
    };

    return (
        <div className="flex items-center gap-2">
            <Label htmlFor="type-filter" className="text-sm font-medium whitespace-nowrap hidden sm:block">
                Type:
            </Label>
            <Select value={currentType} onValueChange={handleTypeChange}>
                <SelectTrigger id="type-filter" className="w-[180px]">
                    <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {PRODUCT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                            {TYPE_LABELS[type] || type}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
