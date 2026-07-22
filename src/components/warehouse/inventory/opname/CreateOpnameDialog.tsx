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
import { createOpnameSession } from '@/actions/inventory/opname';
import { getLocations } from '@/actions/inventory/inventory';
import { useRouter } from 'next/navigation';
import { warehouseComponentLabels } from '@/lib/labels';

export function CreateOpnameDialog({ basePath = '/warehouse/opname' }: { basePath?: string }) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    interface Location {
        id: string;
        name: string;
    }
    const [locations, setLocations] = useState<Location[]>([]);
    const [locationId, setLocationId] = useState('');
    const [remarks, setRemarks] = useState('');
    const router = useRouter();

    useEffect(() => {
        if (open) {
            getLocations().then(res => {
                if (!res.success) {
                    toast.error(res.error || 'Gagal memuat lokasi');
                    return;
                }
                if (res.data) {
                    setLocations(res.data);
                }
            });
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!locationId) {
            toast.error('Pilih lokasi terlebih dahulu');
            return;
        }

        setIsLoading(true);
        try {
            const result = await createOpnameSession(locationId, remarks);
            if (!result.success) {
                toast.error(`Gagal membuat opname: ${result.error || 'Silakan coba lagi'}`);
                return;
            }
            if (result.data) {
                toast.success("Sesi Stock Opname berhasil dibuat");
                setOpen(false);
                router.push(`${basePath}/${result.data.id}`);
            }
        } catch {
            toast.error('Gagal memproses BOM. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="shadow-sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {warehouseComponentLabels.createOpname}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{warehouseComponentLabels.createOpname}</DialogTitle>
                    <DialogDescription>
                        {warehouseComponentLabels.createOpnameDesc}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Select value={locationId} onValueChange={setLocationId}>
                            <SelectTrigger>
                                <SelectValue placeholder={warehouseComponentLabels.selectWarehouseOpname} />
                            </SelectTrigger>
                            <SelectContent>
                                {locations.map((loc) => (
                                    <SelectItem key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">Select the warehouse location to audit.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="remarks">Remarks (Optional)</Label>
                        <Input
                            id="remarks"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder={warehouseComponentLabels.eGEndOfMonth}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <span className="h-3 w-3 border-2 border-background/30 border-t-background rounded-full animate-spin mr-2" />
                                Creating...
                            </>
                        ) : "Start Session"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
