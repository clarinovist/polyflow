'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { endOfWeek, format, isValid, parseISO, startOfWeek } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    CalendarDays,
    Plus,
    ArrowRight,
    Search,
    RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { createDeliverySchedule } from '@/actions/sales/delivery-schedules';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { STATUS_LABELS } from './schedule-detail/presentation';

const FILTERS = [
    { value: 'ALL', label: 'Semua' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Aktif' },
    { value: 'CLOSED', label: 'Selesai' },
] as const;
type StatusFilter = (typeof FILTERS)[number]['value'];

interface ScheduleRow {
    id: string;
    scheduleNumber: string;
    weekStart: string;
    weekEnd: string;
    status: string;
    vehicles: {
        orders: {
            id: string;
            status: string;
            deliveryOrderId: string | null;
        }[];
    }[];
}
interface ScheduleListClientProps {
    schedules: ScheduleRow[];
    loadError?: boolean;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}
function isCurrentWeek(weekStart: string, weekEnd: string): boolean {
    const now = new Date();
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return now >= start && now <= end;
}
function statusStyle(status: string) {
    if (status === 'DRAFT')
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
    if (['ACTIVE', 'CONFIRMED', 'IN_TRANSIT'].includes(status))
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300';
    if (['CLOSED', 'COMPLETED'].includes(status))
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
    return 'bg-muted text-muted-foreground';
}

export function ScheduleListClient({
    schedules,
    loadError = false,
}: ScheduleListClientProps) {
    const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');
    const [search, setSearch] = useState('');
    const [currentWeekOnly, setCurrentWeekOnly] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [isRefreshing, startRefresh] = useTransition();
    const router = useRouter();

    const filtered = schedules.filter((schedule) => {
        const matchesStatus =
            filterStatus === 'ALL' ||
            (filterStatus === 'ACTIVE'
                ? ['ACTIVE', 'CONFIRMED', 'IN_TRANSIT'].includes(
                      schedule.status,
                  )
                : filterStatus === 'CLOSED'
                  ? ['CLOSED', 'COMPLETED'].includes(schedule.status)
                  : schedule.status === filterStatus);
        return (
            matchesStatus &&
            schedule.scheduleNumber
                .toLowerCase()
                .includes(search.trim().toLowerCase()) &&
            (!currentWeekOnly ||
                isCurrentWeek(schedule.weekStart, schedule.weekEnd))
        );
    });
    const hasFilters =
        filterStatus !== 'ALL' || search.trim() !== '' || currentWeekOnly;
    const resetFilters = () => {
        setFilterStatus('ALL');
        setSearch('');
        setCurrentWeekOnly(false);
    };
    const previewDate = selectedDate ? parseISO(selectedDate) : null;
    const previewPeriod =
        previewDate && isValid(previewDate)
            ? `${format(startOfWeek(previewDate, { weekStartsOn: 1 }), 'EEEE, d MMM yyyy', { locale: idLocale })} — ${format(endOfWeek(previewDate, { weekStartsOn: 1 }), 'EEEE, d MMM yyyy', { locale: idLocale })}`
            : null;

    const handleCreate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedDate) {
            toast.error('Silakan pilih tanggal terlebih dahulu.');
            return;
        }
        setIsCreating(true);
        try {
            const result = await createDeliverySchedule({
                weekStart: new Date(selectedDate),
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal membuat jadwal.');
                return;
            }
            toast.success('Jadwal baru berhasil dibuat.');
            setShowCreateModal(false);
            setSelectedDate('');
            router.refresh();
        } catch {
            toast.error('Gagal membuat jadwal. Silakan coba lagi.');
        } finally {
            setIsCreating(false);
        }
    };

    const rows = filtered.map((schedule) => ({
        ...schedule,
        currentWeek: isCurrentWeek(schedule.weekStart, schedule.weekEnd),
        tripCount: schedule.vehicles.length,
        stopCount: schedule.vehicles.reduce(
            (sum, trip) => sum + trip.orders.length,
            0,
        ),
        unlinked: schedule.vehicles.reduce(
            (sum, trip) =>
                sum +
                trip.orders.filter((stop) => !stop.deliveryOrderId).length,
            0,
        ),
    }));

    if (loadError) {
        return (
            <Card>
                <CardContent className="space-y-3 py-10 text-center">
                    <p role="alert" className="font-medium">
                        Gagal memuat jadwal kirim.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Coba muat ulang untuk menampilkan daftar jadwal.
                    </p>
                    <Button
                        variant="outline"
                        disabled={isRefreshing}
                        onClick={() => startRefresh(() => router.refresh())}
                    >
                        <RefreshCw
                            className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                        {isRefreshing ? 'Memuat...' : 'Coba Lagi'}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                        role="group"
                        aria-label="Filter status jadwal"
                        className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
                    >
                        {FILTERS.map((filter) => (
                            <Button
                                key={filter.value}
                                size="sm"
                                variant={
                                    filterStatus === filter.value
                                        ? 'secondary'
                                        : 'ghost'
                                }
                                aria-pressed={filterStatus === filter.value}
                                onClick={() => setFilterStatus(filter.value)}
                                className={
                                    filterStatus === filter.value
                                        ? 'bg-background shadow-sm'
                                        : 'text-muted-foreground'
                                }
                            >
                                {filter.label}
                            </Button>
                        ))}
                    </div>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Jadwal Baru
                        </Button>
                    </DialogTrigger>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-48">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            aria-label="Cari nomor jadwal"
                            placeholder="Cari nomor jadwal..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button
                        variant={currentWeekOnly ? 'secondary' : 'outline'}
                        aria-pressed={currentWeekOnly}
                        onClick={() => setCurrentWeekOnly(!currentWeekOnly)}
                    >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Minggu Ini
                    </Button>
                    {hasFilters && (
                        <Button variant="ghost" onClick={resetFilters}>
                            Reset Filter
                        </Button>
                    )}
                </div>
                <p role="status" className="text-sm text-muted-foreground">
                    Menampilkan {filtered.length} dari {schedules.length} jadwal
                </p>

                {rows.length === 0 ? (
                    <Card>
                        <CardContent className="space-y-2 py-12 text-center">
                            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                            <h2 className="font-medium">
                                {schedules.length === 0
                                    ? 'Belum ada jadwal kirim'
                                    : 'Tidak ada jadwal yang cocok'}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {schedules.length === 0
                                    ? 'Mulai dengan membuat jadwal mingguan baru.'
                                    : 'Coba ubah pencarian atau reset filter.'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card className="hidden md:block">
                            <CardContent className="px-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                Jadwal / Periode
                                            </TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">
                                                Trip
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Rencana
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Tanpa SJ
                                            </TableHead>
                                            <TableHead>
                                                <span className="sr-only">
                                                    Aksi
                                                </span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.map((schedule) => (
                                            <TableRow
                                                key={schedule.id}
                                                className={
                                                    schedule.currentWeek
                                                        ? 'bg-muted/40'
                                                        : ''
                                                }
                                            >
                                                <TableCell className="space-y-1 py-4">
                                                    <Link
                                                        href={`/sales/delivery-schedules/${schedule.id}`}
                                                        className="font-medium underline-offset-4 hover:underline"
                                                    >
                                                        {
                                                            schedule.scheduleNumber
                                                        }
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(
                                                            schedule.weekStart,
                                                        )}{' '}
                                                        —{' '}
                                                        {formatDate(
                                                            schedule.weekEnd,
                                                        )}
                                                    </p>
                                                    {schedule.currentWeek && (
                                                        <Badge
                                                            variant="outline"
                                                            className="text-xs"
                                                        >
                                                            Minggu Ini
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        className={statusStyle(
                                                            schedule.status,
                                                        )}
                                                    >
                                                        {STATUS_LABELS[
                                                            schedule.status
                                                        ] || schedule.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {schedule.tripCount}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {schedule.stopCount}
                                                </TableCell>
                                                <TableCell
                                                    className={`text-right tabular-nums ${schedule.unlinked > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
                                                >
                                                    {schedule.unlinked}
                                                    <span className="sr-only">
                                                        {' '}
                                                        rencana tanpa surat
                                                        jalan
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        asChild
                                                        variant="ghost"
                                                        size="sm"
                                                    >
                                                        <Link
                                                            href={`/sales/delivery-schedules/${schedule.id}`}
                                                            aria-label={`Buka ${schedule.scheduleNumber}`}
                                                        >
                                                            Buka
                                                            <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                        <div className="space-y-3 md:hidden">
                            {rows.map((schedule) => (
                                <Link
                                    key={schedule.id}
                                    href={`/sales/delivery-schedules/${schedule.id}`}
                                    aria-label={`Buka ${schedule.scheduleNumber}`}
                                    className={`block space-y-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${schedule.currentWeek ? 'bg-muted/40' : 'bg-card'}`}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="min-w-0 flex-1 basis-40 break-words font-semibold">
                                            {schedule.scheduleNumber}
                                        </span>
                                        <Badge
                                            className={statusStyle(
                                                schedule.status,
                                            )}
                                        >
                                            {STATUS_LABELS[schedule.status] ||
                                                schedule.status}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {formatDate(schedule.weekStart)} —{' '}
                                        {formatDate(schedule.weekEnd)}
                                    </p>
                                    {schedule.currentWeek && (
                                        <Badge variant="outline">
                                            Minggu Ini
                                        </Badge>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm text-muted-foreground">
                                        <span>{schedule.tripCount} trip</span>
                                        <span>
                                            {schedule.stopCount} rencana
                                        </span>
                                        <span
                                            className={
                                                schedule.unlinked > 0
                                                    ? 'text-amber-700 dark:text-amber-400'
                                                    : ''
                                            }
                                        >
                                            {schedule.unlinked} tanpa SJ
                                        </span>
                                        <ArrowRight className="ml-auto h-4 w-4" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}

                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleCreate} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>Buat Jadwal Baru</DialogTitle>
                            <DialogDescription>
                                Pilih tanggal dalam minggu yang ingin
                                dijadwalkan. Periode berlangsung Senin–Minggu.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-2">
                            <Label htmlFor="schedule-week-date">
                                Tanggal dalam minggu
                            </Label>
                            <Input
                                id="schedule-week-date"
                                type="date"
                                required
                                value={selectedDate}
                                onChange={(event) =>
                                    setSelectedDate(event.target.value)
                                }
                                aria-describedby="schedule-week-preview"
                            />
                            <div
                                id="schedule-week-preview"
                                role="status"
                                className="rounded-lg bg-muted/50 p-3 text-sm"
                            >
                                <p className="font-medium">Periode jadwal</p>
                                <p className="mt-1 text-muted-foreground">
                                    {previewPeriod ||
                                        'Pilih tanggal untuk melihat periode jadwal.'}
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowCreateModal(false)}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={isCreating || !selectedDate}
                            >
                                {isCreating ? 'Membuat...' : 'Buat Jadwal'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </div>
        </Dialog>
    );
}
