'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { createDeliverySchedule } from '@/actions/sales/delivery-schedules';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  IN_TRANSIT: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Dikonfirmasi',
  IN_TRANSIT: 'Dalam Perjalanan',
  COMPLETED: 'Selesai',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface ScheduleVehicle {
  vehicle: { id: string; plateNumber: string; name: string };
  orders: { id: string }[];
}

interface ScheduleRow {
  id: string;
  scheduleNumber: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  notes: string | null;
  vehicles: ScheduleVehicle[];
  createdBy: { name: string | null } | null;
}

interface ScheduleListClientProps {
  schedules: ScheduleRow[];
}

export function ScheduleListClient({ schedules }: ScheduleListClientProps) {
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const filtered = filterStatus === 'ALL'
    ? schedules
    : schedules.filter((s) => s.status === filterStatus);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createDeliverySchedule();
      if (!result.success) {
        toast.error(result.error || 'Gagal membuat jadwal.');
        return;
      }
      toast.success('Jadwal baru berhasil dibuat.');
      router.refresh();
    } catch {
      toast.error('Gagal membuat jadwal. Silakan coba lagi.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {/* Desktop */}
      <Card className="hidden md:block">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Daftar Jadwal
            <Badge variant="secondary">{schedules.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="CONFIRMED">Dikonfirmasi</SelectItem>
                <SelectItem value="IN_TRANSIT">Dalam Perjalanan</SelectItem>
                <SelectItem value="COMPLETED">Selesai</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={isCreating}>
              <Plus className="h-4 w-4 mr-2" />
              {isCreating ? 'Membuat...' : 'Jadwal Baru'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada jadwal kiriman. Klik &quot;Jadwal Baru&quot; untuk membuat.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Jadwal</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center"># Armada</TableHead>
                  <TableHead className="text-center"># DO</TableHead>
                  <TableHead>Dibuat Oleh</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const totalDO = s.vehicles.reduce((sum, sv) => sum + sv.orders.length, 0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/sales/delivery-schedules/${s.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {s.scheduleNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatDate(s.weekStart)} — {formatDate(s.weekEnd)}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[s.status] || ''}>
                          {STATUS_LABELS[s.status] || s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{s.vehicles.length}</TableCell>
                      <TableCell className="text-center">{totalDO}</TableCell>
                      <TableCell>{s.createdBy?.name || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/sales/delivery-schedules/${s.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="CONFIRMED">Dikonfirmasi</SelectItem>
              <SelectItem value="IN_TRANSIT">Perjalanan</SelectItem>
              <SelectItem value="COMPLETED">Selesai</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleCreate} disabled={isCreating}>
            <Plus className="h-4 w-4 mr-1" /> Baru
          </Button>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Belum ada jadwal.</div>
        ) : (
          filtered.map((s) => {
            const totalDO = s.vehicles.reduce((sum, sv) => sum + sv.orders.length, 0);
            return (
              <Link key={s.id} href={`/sales/delivery-schedules/${s.id}`}>
                <Card className="p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-blue-600">{s.scheduleNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(s.weekStart)} — {formatDate(s.weekEnd)}
                      </p>
                    </div>
                    <Badge className={STATUS_STYLES[s.status] || ''}>
                      {STATUS_LABELS[s.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span>{s.vehicles.length} armada</span>
                    <span>{totalDO} surat jalan</span>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
