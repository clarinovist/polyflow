'use that';
'use client';

import { useState, useEffect } from 'react';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createOpnameSession } from '@/actions/opname';
import { getLocations } from '@/actions/inventory';
import { useRouter } from 'next/navigation';

export function CreateOpnameDialog() {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [locationId, setLocationId] = useState('');
    const [remarks, setRemarks] = useState('');
    const router = useRouter();

    useEffect(() => {
        if (open) {
            getLocations().then(setLocations);
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!locationId) {
            toast.error("Please select a location");
            return;
        }

        setIsLoading(true);
        try {
            const result = await createOpnameSession(locationId, remarks);
            if (result.success) {
                toast.success("Stock Opname session created");
                setOpen(false);
                router.push(`/dashboard/inventory/opname/${result.id}`);
            } else {
                toast.error(`Error: ${result.error}`);
            }
        } catch (error) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="mr-2 h-4 w-4" />
                    New Audit Session
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Start New Stock Opname</DialogTitle>
                    <DialogDescription>
                        Create a new physical inventory counting session. This will take a snapshot of current system stock.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="location" className="text-right">
                            Location
                        </Label>
                        <Select value={locationId} onValueChange={setLocationId}>
                            <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="remarks" className="text-right">
                            Remarks
                        </Label>
                        <Input
                            id="remarks"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g. End of Month Audit"
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? "creating..." : "Start Session"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
