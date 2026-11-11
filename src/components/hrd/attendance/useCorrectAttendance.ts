'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { correctAttendance } from '@/actions/admin/attendance';
import { toWibInput } from './attendance-format';
import type { AttendanceRecord } from './attendance-recap-types';

export interface CorrectionForm {
    clockInAt: string;
    clockOutAt: string;
    notes: string;
}

export interface CorrectionPayload {
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
}

const EMPTY_FORM: CorrectionForm = { clockInAt: '', clockOutAt: '', notes: '' };

/** Nilai awal form koreksi dari record: jam dalam WIB, catatan kosong. */
export function buildInitialForm(record: AttendanceRecord): CorrectionForm {
    return {
        clockInAt: record.clockInAt ? toWibInput(record.clockInAt) : '',
        clockOutAt: record.clockOutAt ? toWibInput(record.clockOutAt) : '',
        notes: '',
    };
}

/**
 * Kirim hanya yang benar-benar diubah — field yang lolos apa adanya akan
 * kehilangan detik dan menimpa jam yang sudah benar.
 */
export function buildCorrectionPayload(
    current: CorrectionForm,
    initial: CorrectionForm,
): CorrectionPayload {
    const payload: CorrectionPayload = {};
    if (current.clockInAt !== initial.clockInAt && current.clockInAt) {
        payload.clockInAt = current.clockInAt;
    }
    if (current.clockOutAt !== initial.clockOutAt && current.clockOutAt) {
        payload.clockOutAt = current.clockOutAt;
    }
    if (current.notes) {
        payload.notes = current.notes;
    }
    return payload;
}

/** State + aksi dialog "Koreksi Jam" untuk satu record absensi. */
export function useCorrectAttendance(onSaved: () => void) {
    const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);
    const [form, setForm] = useState<CorrectionForm>(EMPTY_FORM);
    const [initial, setInitial] = useState<CorrectionForm>(EMPTY_FORM);
    const [loading, setLoading] = useState(false);

    const open = (record: AttendanceRecord) => {
        const next = buildInitialForm(record);
        setCorrecting(record);
        setForm(next);
        setInitial(next);
    };

    const close = () => setCorrecting(null);

    const setField = (field: keyof CorrectionForm, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const submit = async () => {
        if (!correcting) return;
        setLoading(true);
        try {
            const res = await correctAttendance(
                correcting.id,
                buildCorrectionPayload(form, initial),
            );
            if (res.success) {
                toast.success('Koreksi tersimpan');
                setCorrecting(null);
                onSaved();
            } else {
                toast.error(res.error || 'Gagal koreksi');
            }
        } catch {
            toast.error('Gagal koreksi');
        } finally {
            setLoading(false);
        }
    };

    return { correcting, form, loading, open, close, setField, submit };
}
