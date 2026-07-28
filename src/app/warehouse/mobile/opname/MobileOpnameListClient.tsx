'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    MapPin,
    Search,
    RefreshCw,
    ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { CreateOpnameDialog } from '@/components/warehouse/inventory/opname/CreateOpnameDialog';

type OpnameSession = {
    id: string;
    opnameNumber: string | null;
    status: string;
    remarks: string | null;
    location: { name: string };
    createdBy: { name: string | null } | null;
    createdAt: string;
    items: { id: string; countedQuantity: number | null }[];
};

interface MobileOpnameListClientProps {
    sessions: OpnameSession[];
}

export function MobileOpnameListClient({ sessions = [] }: MobileOpnameListClientProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'COMPLETED'>('ALL');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const sessionsList = Array.isArray(sessions) ? sessions : [];
    const openCount = sessionsList.filter((s) => s?.status === 'OPEN').length;

    const filtered = sessionsList.filter((s) => {
        if (!s) return false;
        if (filter === 'OPEN' && s.status !== 'OPEN') return false;
        if (filter === 'COMPLETED' && s.status !== 'COMPLETED') return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (s.opnameNumber || '').toLowerCase().includes(q) ||
            (s.location?.name || '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold">Stock Opname</h1>
                    <p className="text-sm text-muted-foreground">
                        {openCount} sesi aktif
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <CreateOpnameDialog basePath="/warehouse/mobile/opname" />
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari nomor opname, lokasi..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 text-sm"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <Button
                        variant={filter === 'ALL' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setFilter('ALL')}
                    >
                        Semua ({sessionsList.length})
                    </Button>
                    <Button
                        variant={filter === 'OPEN' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setFilter('OPEN')}
                    >
                        Aktif ({openCount})
                    </Button>
                    <Button
                        variant={filter === 'COMPLETED' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setFilter('COMPLETED')}
                    >
                        Selesai ({sessionsList.filter((s) => s?.status === 'COMPLETED').length})
                    </Button>
                </div>
            </div>

            {/* Session List */}
            <div className="space-y-2">
                {filtered.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">
                            {search ? 'Tidak ada sesi yang cocok' : 'Belum ada sesi stock opname'}
                        </p>
                        {!search && (
                            <div className="pt-2 flex justify-center">
                                <CreateOpnameDialog basePath="/warehouse/mobile/opname" />
                            </div>
                        )}
                    </div>
                ) : (
                    filtered.map((session) => {
                        const items = session.items ?? [];
                        const totalItems = items.length;
                        const countedItems = items.filter(
                            (i) => i?.countedQuantity !== null && i?.countedQuantity !== undefined,
                        ).length;
                        const isOpen = session.status === 'OPEN';

                        return (
                            <Link
                                key={session.id}
                                href={`/warehouse/mobile/opname/${session.id}`}
                                className="block p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge
                                                variant={isOpen ? 'secondary' : 'outline'}
                                                className={
                                                    isOpen
                                                        ? 'bg-primary/10 text-primary border-transparent text-[10px]'
                                                        : 'border-emerald-500/30 text-emerald-600 text-[10px]'
                                                }
                                            >
                                                {isOpen ? 'OPEN' : 'COMPLETED'}
                                            </Badge>
                                            {isOpen ? (
                                                <Clock className="h-3.5 w-3.5 text-primary" />
                                            ) : (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold truncate">
                                            {session.opnameNumber || 'Tanpa Nomor'}
                                        </p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <p className="text-xs text-muted-foreground truncate">
                                                {session.location?.name || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
                                </div>

                                <div className="flex items-center justify-between mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                                    <span>
                                        {countedItems}/{totalItems} item dihitung
                                    </span>
                                    <span>
                                        {new Date(session.createdAt).toLocaleDateString('id-ID', {
                                            day: 'numeric',
                                            month: 'short',
                                        })}
                                    </span>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>
        </div>
    );
}
