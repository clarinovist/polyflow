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
import { Card, CardContent } from '@/components/ui/card';
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
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="font-semibold text-slate-700">Name</TableHead>
                                <TableHead className="font-semibold text-slate-700">Start Time</TableHead>
                                <TableHead className="font-semibold text-slate-700">End Time</TableHead>
                                <TableHead className="font-semibold text-slate-700">Status</TableHead>
                                <TableHead className="text-right font-semibold text-slate-700">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shifts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                                                <Edit className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <p className="text-base font-medium text-slate-900">No shifts found</p>
                                            <p className="text-sm text-slate-500">Add a new shift to define working hours.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                shifts.map((shift) => (
                                    <TableRow key={shift.id} className="hover:bg-slate-50/50">
                                        <TableCell className="font-medium text-slate-900">{shift.name}</TableCell>
                                        <TableCell className="text-slate-600">{shift.startTime}</TableCell>
                                        <TableCell className="text-slate-600">{shift.endTime}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={shift.status === 'ACTIVE' ? 'default' : 'secondary'}
                                                className={shift.status === 'ACTIVE' ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-700"}
                                            >
                                                {shift.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                                    onClick={() => handleEdit(shift)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50"
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
                </CardContent>
            </Card>

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
