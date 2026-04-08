'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLocationSchema, CreateLocationValues } from '@/lib/schemas/inventory';
import { createLocation, updateLocation } from '@/actions/inventory/locations';
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
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Warehouse, Plus, Loader2 } from 'lucide-react';

export interface LocationData {
    id?: string;
    name: string;
    slug?: string | null;
    description?: string | null;
    locationType: 'INTERNAL' | 'CUSTOMER_OWNED';
}

interface LocationFormDialogProps {
    initialData?: LocationData;
    trigger?: React.ReactNode;
}

export function LocationFormDialog({ initialData, trigger }: LocationFormDialogProps) {
    const isEditing = !!initialData?.id;
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const form = useForm<CreateLocationValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(createLocationSchema) as any,
        defaultValues: {
            name: initialData?.name || '',
            slug: initialData?.slug || '',
            description: initialData?.description || '',
            locationType: initialData?.locationType || 'INTERNAL',
        },
    });

    const onOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            form.reset({
                name: initialData?.name || '',
                slug: initialData?.slug || '',
                description: initialData?.description || '',
                locationType: initialData?.locationType || 'INTERNAL',
            });
        }
    };

    const onSubmit = async (data: CreateLocationValues) => {
        setIsLoading(true);
        try {
            const res = isEditing && initialData?.id
                ? await updateLocation(initialData.id, data)
                : await createLocation(data);

            if (!res.success) {
                toast.error(res.error || `Failed to ${isEditing ? 'update' : 'create'} location`);
                return;
            }

            toast.success(`Location ${isEditing ? 'updated' : 'created'} successfully`);
            setOpen(false);
            router.refresh();
        } catch (_error) {
            toast.error(`An unexpected error occurred`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Location
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Warehouse className="h-5 w-5" />
                        {isEditing ? 'Edit Location' : 'New Location'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditing 
                            ? 'Modify the details of this warehouse location.' 
                            : 'Create a new warehouse location or customer storage area.'}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Location Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Maklon Storage A" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="slug"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Identifier (Slug)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Leave blank to auto-generate" {...field} />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                        Unique identifier used in system references. Optional.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="locationType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Location Type</FormLabel>
                                    <Select 
                                        onValueChange={field.onChange} 
                                        defaultValue={field.value}
                                        disabled={isEditing} // usually type shouldn't change, but optional
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="INTERNAL">Internal Warehouse</SelectItem>
                                            <SelectItem value="CUSTOMER_OWNED">Customer Owned (Maklon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea 
                                            placeholder="Details about this location..." 
                                            className="resize-none h-20" 
                                            {...field} 
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Location'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
