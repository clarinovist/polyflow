'use client';

import { useState } from 'react';
import { WorkShift } from '@prisma/client';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import { deleteWorkShift } from '@/actions/work-shifts';
import { toast } from 'sonner';
import { ShiftDialog } from './ShiftDialog';

interface ShiftListProps {
    shifts: WorkShift[];
}

export function ShiftList({ shifts }: ShiftListProps) {
    const [editingShift, setEditingShift] = useState<WorkShift | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleEdit = (shift: WorkShift) => {
        setEditingShift(shift);
        setDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this shift?')) {
            const result = await deleteWorkShift(id);
            if (result.success) {
                toast.success('Shift deleted');
            } else {
                toast.error(result.error || 'Failed to delete shift');
            }
        }
    };

    return (
        <>

            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="font-semibold text-muted-foreground">Name</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Start Time</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">End Time</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                        <TableHead className="text-right font-semibold text-muted-foreground">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {shifts.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                                        <Edit className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-base font-medium text-foreground">No shifts found</p>
                                    <p className="text-sm text-muted-foreground">Add a new shift to define working hours.</p>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        shifts.map((shift) => (
                            <TableRow key={shift.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium text-foreground">{shift.name}</TableCell>
                                <TableCell className="text-muted-foreground">{shift.startTime}</TableCell>
                                <TableCell className="text-muted-foreground">{shift.endTime}</TableCell>
                                <TableCell>
                                    <Badge
                                        variant={shift.status === 'ACTIVE' ? 'default' : 'secondary'}
                                        className={shift.status === 'ACTIVE' ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" : "bg-muted text-muted-foreground"}
                                    >
                                        {shift.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10"
                                            onClick={() => handleEdit(shift)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(shift.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>


            <ShiftDialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setEditingShift(null);
                }}
                shiftToEdit={editingShift}
            />
        </>
    );
}
