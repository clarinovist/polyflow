'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Users } from 'lucide-react';
import { addProductionShift, deleteProductionShift } from '@/actions/production';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

interface ShiftManagerProps {
    orderId: string;
    shifts: {
        id: string;
        shiftName: string;
        startTime: Date | string;
        endTime: Date | string;
        operator: { id: string; name: string | null; code: string } | null;
        helpers: { id: string; name: string | null; code: string }[];
    }[];
    operators: { id: string; name: string | null; code: string }[];
    helpers: { id: string; name: string | null; code: string }[];

    readOnly?: boolean;
    workShifts: { id: string; name: string; startTime: string; endTime: string; status: string }[];
    machines: { id: string; name: string; code: string }[];
}

export function ShiftManager({ orderId, shifts, operators, helpers, readOnly, workShifts, machines }: ShiftManagerProps) {
    const [_isAdding, _setIsAdding] = useState(false);

    async function handleDelete(shiftId: string) {
        if (!confirm('Are you sure you want to delete this shift?')) return;
        const result = await deleteProductionShift(shiftId, orderId);
        if (result.success) {
            toast.success('Shift deleted');
        } else {
            toast.error('Failed to delete shift', { description: result.error });
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Production Shifts</h3>
                {!readOnly && (
                    <AddShiftDialog
                        orderId={orderId}
                        operators={operators}
                        helpers={helpers}
                        workShifts={workShifts}
                        machines={machines}
                        onOpenChange={_setIsAdding}
                    />
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {shifts.map((shift) => (
                    <Card key={shift.id}>
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <CardTitle className="text-base font-medium flex items-center gap-2">
                                        {shift.shiftName}
                                        <Badge variant="outline" className="font-normal text-xs">
                                            {format(new Date(shift.startTime), 'p')} - {format(new Date(shift.endTime), 'p')}
                                        </Badge>
                                    </CardTitle>
                                    <span className="text-sm text-slate-500">
                                        {format(new Date(shift.startTime), 'PPP')}
                                    </span>
                                </div>
                                {!readOnly && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                                        onClick={() => handleDelete(shift.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-2 text-sm">
                                <div className="flex items-center gap-2 text-slate-700">
                                    <Users className="h-4 w-4 text-slate-400" />
                                    <span className="font-medium">Operator:</span>
                                    {shift.operator ? shift.operator.name : <span className="text-slate-400">Unassigned</span>}
                                </div>
                                <div className="flex items-start gap-2 text-slate-700">
                                    <span className="ml-6 flex items-start gap-2">
                                        <span className="font-medium">Helpers:</span>
                                        <span className="text-slate-600">
                                            {shift.helpers.length > 0
                                                ? shift.helpers.map((h) => h.name).join(', ')
                                                : 'None'}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {shifts.length === 0 && (
                    <div className="text-center py-6 border rounded-lg bg-slate-50 dark:bg-slate-900 text-muted-foreground text-sm">
                        Belum ada shift. Klik <span className="font-semibold text-slate-900 dark:text-slate-100">Add Shift</span> untuk jadwalkan tim produksi.
                    </div>
                )}
            </div>
        </div>
    );
}

function AddShiftDialog({
    orderId,
    operators,
    helpers,
    onOpenChange,
    workShifts,
    machines
}: {
    orderId: string;
    operators: { id: string; name: string | null; code: string }[];
    helpers: { id: string; name: string | null; code: string }[];
    onOpenChange: (open: boolean) => void;
    workShifts: { id: string; name: string; startTime: string; endTime: string; status: string }[];
    machines: { id: string; name: string; code: string }[];
}) {
    const [open, setOpen] = useState(false);
    const [selectedHelpers, setSelectedHelpers] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // State to manage form values for controlled inputs
    const [shiftName, setShiftName] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');

    const handleHelperToggle = (helperId: string) => {
        setSelectedHelpers((prev) =>
            prev.includes(helperId)
                ? prev.filter((id) => id !== helperId)
                : [...prev, helperId]
        );
    };

    const handleWorkShiftSelect = (shiftId: string) => {
        const shift = workShifts.find(s => s.id === shiftId);
        if (shift) {
            setShiftName(shift.name);
            setStartTime(shift.startTime);
            setEndTime(shift.endTime);
        }
    };

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.currentTarget);

        // Combine date and time
        const dateStr = formData.get('date') as string;
        // Use state or form data (form data handles manual overrides)
        const startStr = formData.get('startTime') as string;
        const endStr = formData.get('endTime') as string;

        const startTimeDate = new Date(`${dateStr}T${startStr}`);
        const endTimeDate = new Date(`${dateStr}T${endStr}`);

        // Handle overnight shifts (end time before start time)
        if (endTimeDate < startTimeDate) {
            endTimeDate.setDate(endTimeDate.getDate() + 1);
        }

        const data = {
            productionOrderId: orderId,
            shiftName: formData.get('shiftName') as string,
            startTime: startTimeDate,
            endTime: endTimeDate,
            operatorId: formData.get('operatorId') as string || undefined,
            helperIds: selectedHelpers.length > 0 ? selectedHelpers : undefined,
            machineId: formData.get('machineId') as string || undefined,
        };

        const result = await addProductionShift(data);
        setLoading(false);

        if (result.success) {
            toast.success('Shift added successfully');
            setOpen(false);
            onOpenChange(false);
            setSelectedHelpers([]);
            // Reset state
            setShiftName('');
            setStartTime('');
            setEndTime('');
        } else {
            toast.error('Failed to add shift', { description: result.error });
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Shift
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Production Shift</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">

                    {/* Work Shift Selection */}
                    <div className="space-y-2">
                        <Label>Standard Shift (Optional)</Label>
                        <Select onValueChange={handleWorkShiftSelect}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Standard Shift" />
                            </SelectTrigger>
                            <SelectContent>
                                {workShifts.filter(s => s.status === 'ACTIVE').map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name} ({s.startTime} - {s.endTime})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="shiftName">Shift Name</Label>
                        <Input
                            id="shiftName"
                            name="shiftName"
                            placeholder="e.g. Morning Shift"
                            required
                            value={shiftName}
                            onChange={(e) => setShiftName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input id="date" name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="machineId">Assigned Machine</Label>
                        <Select name="machineId">
                            <SelectTrigger>
                                <SelectValue placeholder="Select Machine (Updates Order)" />
                            </SelectTrigger>
                            <SelectContent>
                                {machines.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name} ({m.code})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500">Selecting a machine here will update the active machine for this order.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="startTime">Start Time</Label>
                            <Input
                                id="startTime"
                                name="startTime"
                                type="time"
                                required
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endTime">End Time</Label>
                            <Input
                                id="endTime"
                                name="endTime"
                                type="time"
                                required
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="operatorId">Lead Operator</Label>
                        <Select name="operatorId">
                            <SelectTrigger>
                                <SelectValue placeholder="Select Operator" />
                            </SelectTrigger>
                            <SelectContent>
                                {operators.map((op) => (
                                    <SelectItem key={op.id} value={op.id}>
                                        {op.name} ({op.code})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Helpers</Label>
                        <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                            {helpers.map((helper) => (
                                <div key={helper.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`helper-${helper.id}`}
                                        checked={selectedHelpers.includes(helper.id)}
                                        onCheckedChange={() => handleHelperToggle(helper.id)}
                                    />
                                    <label
                                        htmlFor={`helper-${helper.id}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {helper.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Adding...' : 'Add Shift'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
