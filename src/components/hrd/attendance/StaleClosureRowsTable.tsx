'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatIdr } from './attendance-format';
import {
    formatHoursLong,
    formatWibDateTime,
    formatWorkDate,
} from './stale-closure-format';
import type { ClosurePreviewRow } from './stale-closure-types';

const HEADERS = [
    'Karyawan',
    'Tanggal kerja',
    'Jam masuk',
    'Jam pulang usulan',
    'Jam kerja',
    'Upah usulan',
    'Status',
];

function StatusCell({ row }: { row: ClosurePreviewRow }) {
    return (
        <TableCell className="min-w-44 whitespace-normal">
            {row.eligible ? (
                <span className="font-medium text-emerald-600">Layak</span>
            ) : (
                <span className="font-medium text-destructive">
                    Tidak layak
                </span>
            )}
            {row.reason && (
                <p className="text-xs text-destructive">{row.reason}</p>
            )}
            {row.warning && (
                <p className="text-xs text-amber-600">{row.warning}</p>
            )}
        </TableCell>
    );
}

function HoursCell({ row }: { row: ClosurePreviewRow }) {
    if (!row.eligible) return <TableCell>-</TableCell>;
    return (
        <TableCell className="whitespace-nowrap">
            <p>Reguler {formatHoursLong(row.regularHours)}</p>
            {row.overtimeHours > 0 && (
                <p className="text-xs text-muted-foreground">
                    Lembur {formatHoursLong(row.overtimeHours)}
                </p>
            )}
        </TableCell>
    );
}

function PreviewRow({ row }: { row: ClosurePreviewRow }) {
    return (
        <TableRow className={row.eligible ? undefined : 'bg-muted/40'}>
            <TableCell className="whitespace-nowrap">
                <p className="font-medium">{row.employeeName}</p>
                <p className="text-xs text-muted-foreground">
                    <span>{row.employeeCode}</span>
                    {' · '}
                    <span>{row.shiftName}</span>
                </p>
            </TableCell>
            <TableCell className="whitespace-nowrap">
                {formatWorkDate(row.workDate)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
                {formatWibDateTime(row.clockInAt)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
                {formatWibDateTime(row.proposedClockOutAt)}
            </TableCell>
            <HoursCell row={row} />
            <TableCell className="whitespace-nowrap text-right font-medium">
                {row.eligible ? formatIdr(row.earnings) : '-'}
            </TableCell>
            <StatusCell row={row} />
        </TableRow>
    );
}

/** Tabel per baris pratinjau; di layar sempit bisa digeser horizontal. */
export function StaleClosureRowsTable({
    rows,
}: {
    rows: ClosurePreviewRow[];
}) {
    return (
        <div className="max-h-[40vh] overflow-auto rounded-lg border">
            <Table>
                <TableHeader>
                    <TableRow>
                        {HEADERS.map((h) => (
                            <TableHead key={h} className="whitespace-nowrap">
                                {h}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <PreviewRow key={row.id} row={row} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
