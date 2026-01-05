'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createWorkShift, updateWorkShift } from '@/actions/work-shifts';
import { toast } from 'sonner';
import { WorkShift, WorkShiftStatus } from '@prisma/client';

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
    isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface ShiftDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shiftToEdit?: WorkShift | null;
    onSuccess?: () => void;
}

export function ShiftDialog({
    open,
    onOpenChange,
    shiftToEdit,
    onSuccess,
}: ShiftDialogProps) {
    const [loading, setLoading] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            startTime: '08:00',
            endTime: '16:00',
            isActive: true,
        },
        values: shiftToEdit
            ? {
                name: shiftToEdit.name,
                startTime: shiftToEdit.startTime,
                endTime: shiftToEdit.endTime,
                isActive: shiftToEdit.status === 'ACTIVE',
            }
            : undefined,
    });

    // Reset form when dialog closes or opens in a new mode
    // Ideally we rely on key or useEffect, but react-hook-form 'values' prop handles updates when shiftToEdit changes/

    async function onSubmit(values: FormValues) {
        setLoading(true);
        try {
            const status = values.isActive ? WorkShiftStatus.ACTIVE : WorkShiftStatus.INACTIVE;
            let result;

            if (shiftToEdit) {
                result = await updateWorkShift(shiftToEdit.id, {
                    name: values.name,
                    startTime: values.startTime,
                    endTime: values.endTime,
                    status,
                });
            } else {
                result = await createWorkShift({
                    name: values.name,
                    startTime: values.startTime,
                    endTime: values.endTime,
                    status,
                });
            }

            if (result.success) {
                toast.success(
                    shiftToEdit ? 'Shift updated successfully' : 'Shift created successfully'
                );
                onOpenChange(false);
                form.reset();
                if (onSuccess) onSuccess();
            } else {
                toast.error(result.error || 'Something went wrong');
            }
        } catch (error) {
            console.error(error);
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {shiftToEdit ? 'Edit Shift' : 'Add New Shift'}
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Shift Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Morning Shift" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="startTime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Time</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="endTime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>End Time</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="isActive"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Status</FormLabel>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : 'Save Shift'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
