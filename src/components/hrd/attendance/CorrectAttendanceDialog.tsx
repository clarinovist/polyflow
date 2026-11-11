'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AttendanceRecord } from './attendance-recap-types';
import type { CorrectionForm } from './useCorrectAttendance';

interface Props {
    record: AttendanceRecord | null;
    form: CorrectionForm;
    loading: boolean;
    onFieldChange: (field: keyof CorrectionForm, value: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}

/** Dialog koreksi jam masuk/pulang beserta catatan alasan. */
export function CorrectAttendanceDialog({
    record,
    form,
    loading,
    onFieldChange,
    onClose,
    onSubmit,
}: Props) {
    return (
        <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Koreksi Absensi — {record?.employeeName}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="clockIn">Jam Masuk</Label>
                        <Input
                            id="clockIn"
                            type="datetime-local"
                            value={form.clockInAt}
                            onChange={(e) =>
                                onFieldChange('clockInAt', e.target.value)
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clockOut">Jam Pulang</Label>
                        <Input
                            id="clockOut"
                            type="datetime-local"
                            value={form.clockOutAt}
                            onChange={(e) =>
                                onFieldChange('clockOutAt', e.target.value)
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">Catatan</Label>
                        <Textarea
                            id="notes"
                            value={form.notes}
                            onChange={(e) =>
                                onFieldChange('notes', e.target.value)
                            }
                            placeholder="Alasan koreksi..."
                            rows={2}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Batal
                    </Button>
                    <Button onClick={onSubmit} disabled={loading}>
                        {loading ? 'Menyimpan...' : 'Simpan Koreksi'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
