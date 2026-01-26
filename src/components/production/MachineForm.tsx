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

interface MachineFormProps {
    initialData?: Machine;
    locations: { id: string; name: string }[];
}

export function MachineForm({ initialData, locations }: MachineFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
        setError('');

        try {
            if (initialData) {
                await updateMachine(initialData.id, formData);
            } else {
                await createMachine(formData);
            }
            router.push('/production/machines');
            router.refresh();
        } catch (_unused) {
            setError('Something went wrong. Please try again.');
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
            <div className="space-y-2">
                <Label htmlFor="name">Machine Name</Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g. Mixer Turbo 01"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="code">Machine Code</Label>
                <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                    placeholder="e.g. MIX-01"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="type">Machine Type</Label>
                <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value as MachineType })}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.keys(MachineType).map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Select
                    value={formData.locationId}
                    onValueChange={(value) => setFormData({ ...formData, locationId: value })}
                >
                    <SelectTrigger>
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

            <div className="space-y-2">
                <Label htmlFor="costPerHour">Cost Per Hour (IDR)</Label>
                <Input
                    id="costPerHour"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.costPerHour}
                    onChange={(e) => setFormData({ ...formData, costPerHour: Number(e.target.value) })}
                    placeholder="e.g. 50000"
                />
                <p className="text-xs text-muted-foreground">Standard operating cost per hour including electricity/depreciation.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as MachineStatus })}
                >
                    <SelectTrigger>
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

            {error && <div className="text-red-500 text-sm">{error}</div>}

            <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : initialData ? 'Update Machine' : 'Create Machine'}
                </Button>
            </div>
        </form >
    );
}
