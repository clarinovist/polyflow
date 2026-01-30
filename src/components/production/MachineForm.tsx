'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { MachineType, MachineStatus, Machine } from '@prisma/client';
import { createMachine, updateMachine } from '@/actions/machines';
import { toast } from 'sonner';

interface MachineFormProps {
    initialData?: Machine;
    locations: { id: string; name: string }[];
}

export function MachineForm({ initialData, locations }: MachineFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        code: initialData?.code || '',
        type: initialData?.type || MachineType.MIXER,
        locationId: initialData?.locationId || locations[0]?.id || '',
        status: initialData?.status || MachineStatus.ACTIVE,
        costPerHour: initialData?.costPerHour ? Number(initialData.costPerHour) : 0,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let res;
            if (initialData) {
                res = await updateMachine(initialData.id, formData);
            } else {
                res = await createMachine(formData);
            }

            if (res.success) {
                toast.success(initialData ? 'Configuration updated' : 'Machine registered', {
                    description: `${formData.name} (${formData.code}) has been saved successfully.`
                });
                router.push('/dashboard/machines');
                router.refresh();
            } else {
                toast.error('System Error', {
                    description: res.error || 'Failed to save machine configuration'
                });
                setLoading(false);
            }
        } catch (err) {
            console.error('[MACHINE_FORM_SUBMIT_ERROR]', err);
            toast.error('Unexpected failure', {
                description: 'An unexpected error occurred. Please check your connection and try again.'
            });
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
            <div className="grid gap-6">
                <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold tracking-tight">Machine Name</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="e.g. Mixer Turbo 01"
                        className="bg-background/50"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="code" className="text-sm font-semibold tracking-tight">Machine Code</Label>
                    <Input
                        id="code"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        required
                        placeholder="e.g. MIX-01"
                        className="bg-background/50"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="type" className="text-sm font-semibold tracking-tight">Machine Type</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => setFormData({ ...formData, type: value as MachineType })}
                        >
                            <SelectTrigger className="bg-background/50">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(MachineType).map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {type.replace('_', ' ')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="location" className="text-sm font-semibold tracking-tight">Location</Label>
                        <Select
                            value={formData.locationId}
                            onValueChange={(value) => setFormData({ ...formData, locationId: value })}
                        >
                            <SelectTrigger className="bg-background/50">
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
                </div>

                <div className="space-y-2">
                    <Label htmlFor="costPerHour" className="text-sm font-semibold tracking-tight">Cost Per Hour (IDR)</Label>
                    <Input
                        id="costPerHour"
                        type="number"
                        min="0"
                        step="1000"
                        value={formData.costPerHour}
                        onChange={(e) => setFormData({ ...formData, costPerHour: Number(e.target.value) })}
                        placeholder="e.g. 50000"
                        className="bg-background/50"
                    />
                    <p className="text-[11px] text-muted-foreground italic">Standard operating cost including electricity/depreciation.</p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-semibold tracking-tight">Status</Label>
                    <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value as MachineStatus })}
                    >
                        <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(MachineStatus).map((status) => (
                                <SelectItem key={status} value={status}>
                                    {status}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px]">
                    {loading ? 'Processing...' : initialData ? 'Update Machine' : 'Register Machine'}
                </Button>
            </div>
        </form >
    );
}
