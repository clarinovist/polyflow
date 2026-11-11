'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { MULTI_SHIFT_LABEL } from './attendance-recap-helpers';
import { formatHours, formatTime } from './attendance-format';
import type {
    AttendanceRecord,
    PhotoPreview,
} from './attendance-recap-types';
import { AttendanceRowBadges } from './AttendanceRowBadges';
import { AttendanceSourceCell } from './AttendanceSourceCell';
import { AttendanceSelfieThumbs } from './AttendanceSelfieThumbs';

const HEADER_CLASS = 'font-semibold text-muted-foreground';
const COLUMN_COUNT = 12;
const COLUMN_HEADERS = [
    'Kode',
    'Nama',
    'Foto',
    'Shift',
    'Rencana',
    'Masuk',
    'Pulang',
    'Aktual',
    'OT',
    MULTI_SHIFT_LABEL,
    'Sumber',
] as const;

interface Props {
    /** Baris yang lolos filter/pencarian. */
    records: AttendanceRecord[];
    /** Jumlah record sebelum filter; membedakan "kosong" dari "tidak cocok". */
    totalCount: number;
    /** Menonaktifkan menu aksi selagi koreksi diproses. */
    actionsDisabled: boolean;
    onPreview: (preview: PhotoPreview) => void;
    onCorrect: (record: AttendanceRecord) => void;
}

function emptyMessage(totalCount: number): string {
    return totalCount === 0
        ? 'Tidak ada data absensi untuk tanggal ini'
        : 'Tidak ada data yang cocok dengan filter';
}

function OvertimeCell({ hours }: { hours: number }) {
    if (hours <= 0) return <span className="text-muted-foreground">-</span>;
    return (
        <Badge variant="destructive" className="text-xs">
            +{formatHours(hours)}
        </Badge>
    );
}

function RowActions({
    disabled,
    onCorrect,
}: {
    disabled: boolean;
    onCorrect: () => void;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={disabled}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onCorrect}>Koreksi Jam</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function AttendanceDailyRow({
    record: r,
    actionsDisabled,
    onPreview,
    onCorrect,
}: {
    record: AttendanceRecord;
    actionsDisabled: boolean;
    onPreview: Props['onPreview'];
    onCorrect: Props['onCorrect'];
}) {
    return (
        <TableRow className="hover:bg-muted/50">
            <TableCell className="font-medium">{r.employeeCode}</TableCell>
            <TableCell>
                <div>{r.employeeName}</div>
                <AttendanceRowBadges record={r} />
            </TableCell>
            <TableCell>
                <AttendanceSelfieThumbs record={r} onPreview={onPreview} />
            </TableCell>
            <TableCell>{r.shiftName}</TableCell>
            <TableCell>{formatHours(r.plannedHours)}</TableCell>
            <TableCell>{formatTime(r.clockInAt)}</TableCell>
            <TableCell>{formatTime(r.clockOutAt)}</TableCell>
            <TableCell>{formatHours(r.actualHours)}</TableCell>
            <TableCell>
                <OvertimeCell hours={r.overtimeHours} />
            </TableCell>
            <TableCell>
                {r.isOvertimeShift && (
                    <Badge className="bg-orange-500/10 text-orange-600 text-xs">
                        Ya
                    </Badge>
                )}
            </TableCell>
            <TableCell>
                <AttendanceSourceCell record={r} />
            </TableCell>
            <TableCell>
                <RowActions
                    disabled={actionsDisabled}
                    onCorrect={() => onCorrect(r)}
                />
            </TableCell>
        </TableRow>
    );
}

/** Tabel rekap harian: satu baris per record absensi. */
export function AttendanceDailyTable({
    records,
    totalCount,
    actionsDisabled,
    onPreview,
    onCorrect,
}: Props) {
    return (
        <div className="bg-card rounded-xl border overflow-x-auto">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        {COLUMN_HEADERS.map((label) => (
                            <TableHead key={label} className={HEADER_CLASS}>
                                {label}
                            </TableHead>
                        ))}
                        <TableHead className={`${HEADER_CLASS} w-10`}>Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={COLUMN_COUNT}
                                className="h-32 text-center text-muted-foreground"
                            >
                                {emptyMessage(totalCount)}
                            </TableCell>
                        </TableRow>
                    ) : (
                        records.map((r) => (
                            <AttendanceDailyRow
                                key={r.id}
                                record={r}
                                actionsDisabled={actionsDisabled}
                                onPreview={onPreview}
                                onCorrect={onCorrect}
                            />
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
