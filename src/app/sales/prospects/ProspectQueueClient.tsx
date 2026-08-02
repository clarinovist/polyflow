'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
    Search,
    MapPin,
    Phone,
    User,
    Calendar,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import {
    verifyProspectAction,
    rejectProspectAction,
    checkCustomerDuplicateAction,
    listProspectsAction,
} from '@/actions/sales/field-prospect';
import { toast } from 'sonner';

type Customer = {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    billingAddress: string | null;
    city: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    photoUrl: string | null;
    createdAt: string | Date;
    createdById: string | null;
    source: string | null;
    lifecycleStatus: string;
};

type ProspectsData = {
    customers: Customer[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

type DuplicateMatch = {
    id: string;
    name: string;
    phone: string | null;
    distance: number | null;
};

type DuplicateState = Record<
    string,
    {
        loading: boolean;
        result: { isDuplicate: boolean; matches: DuplicateMatch[] } | null;
    }
>;

export function ProspectQueueClient({
    initialData,
}: {
    initialData: ProspectsData;
}) {
    const [data, setData] = useState<ProspectsData>(initialData);
    const [search, setSearch] = useState('');
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [duplicates, setDuplicates] = useState<DuplicateState>({});

    const refresh = useCallback(async () => {
        try {
            const res = await listProspectsAction({ page: 1, pageSize: 100 });
            if (res?.success && res.data) {
                setData(res.data as ProspectsData);
            }
        } catch {
            // silent
        }
    }, []);

    const handleCheckDuplicate = async (c: Customer) => {
        setDuplicates((prev) => ({
            ...prev,
            [c.id]: { loading: true, result: null },
        }));
        try {
            const lat = c.latitude != null ? Number(c.latitude) : undefined;
            const lng = c.longitude != null ? Number(c.longitude) : undefined;
            const res = await checkCustomerDuplicateAction({
                name: c.name,
                phone: c.phone ?? undefined,
                latitude: lat,
                longitude: lng,
            });
            if (res?.success && res.data) {
                setDuplicates((prev) => ({
                    ...prev,
                    [c.id]: {
                        loading: false,
                        result: res.data as {
                            isDuplicate: boolean;
                            matches: DuplicateMatch[];
                        },
                    },
                }));
            } else {
                setDuplicates((prev) => ({
                    ...prev,
                    [c.id]: { loading: false, result: null },
                }));
                toast.error('Gagal cek duplikat');
            }
        } catch {
            setDuplicates((prev) => ({
                ...prev,
                [c.id]: { loading: false, result: null },
            }));
            toast.error('Gagal cek duplikat');
        }
    };

    const handleVerify = async (customerId: string) => {
        if (!confirm('Verifikasi prospek ini menjadi customer aktif?')) return;
        setActioningId(customerId);
        try {
            const res = await verifyProspectAction(customerId);
            if (res?.success) {
                toast.success('Prospek berhasil diverifikasi');
                await refresh();
            } else {
                const err =
                    (res as { error?: string })?.error || 'Gagal verifikasi';
                toast.error(err);
            }
        } catch {
            toast.error('Gagal verifikasi prospek');
        } finally {
            setActioningId(null);
        }
    };

    const handleReject = async (customerId: string) => {
        if (!confirm('Tolak prospek ini? Status akan menjadi INACTIVE.'))
            return;
        setActioningId(customerId);
        try {
            const res = await rejectProspectAction(customerId);
            if (res?.success) {
                toast.success('Prospek ditolak (INACTIVE)');
                await refresh();
            } else {
                const err =
                    (res as { error?: string })?.error || 'Gagal menolak';
                toast.error(err);
            }
        } catch {
            toast.error('Gagal menolak prospek');
        } finally {
            setActioningId(null);
        }
    };

    const filteredCustomers = data.customers.filter((c) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            c.name.toLowerCase().includes(q) ||
            (c.code && c.code.toLowerCase().includes(q)) ||
            (c.city && c.city.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q))
        );
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari nama, kode, kota, telepon..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Badge variant="secondary" className="shrink-0">
                    {filteredCustomers.length} / {data.total}
                </Badge>
            </div>

            {filteredCustomers.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-16 text-center">
                        <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-sm font-semibold text-muted-foreground">
                            Tidak ada prospek
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-1">
                            Prospek dari lapangan akan muncul di sini untuk
                            diverifikasi.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredCustomers.map((c) => {
                        const dup = duplicates[c.id];
                        const isActioning = actioningId === c.id;
                        return (
                            <Card key={c.id} className="overflow-hidden">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-sm truncate">
                                                {c.name}
                                            </h3>
                                            <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-muted-foreground">
                                                {c.code && (
                                                    <span className="inline-flex items-center gap-1">
                                                        {c.code}
                                                    </span>
                                                )}
                                                {c.city && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />{' '}
                                                        {c.city}
                                                    </span>
                                                )}
                                                {c.phone && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />{' '}
                                                        {c.phone}
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />{' '}
                                                    {new Date(
                                                        c.createdAt,
                                                    ).toLocaleDateString(
                                                        'id-ID',
                                                    )}
                                                </span>
                                            </div>
                                            {c.billingAddress && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {c.billingAddress}
                                                </p>
                                            )}
                                            {(c.latitude != null ||
                                                c.longitude != null) && (
                                                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" />{' '}
                                                    {c.latitude != null
                                                        ? Number(
                                                              c.latitude,
                                                          ).toFixed(6)
                                                        : '-'}{' '}
                                                    ,{' '}
                                                    {c.longitude != null
                                                        ? Number(
                                                              c.longitude,
                                                          ).toFixed(6)
                                                        : '-'}
                                                </p>
                                            )}
                                        </div>
                                        {c.photoUrl && (
                                            <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted border">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={c.photoUrl}
                                                    alt={c.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Duplicate badge */}
                                    {dup?.result?.isDuplicate &&
                                        dup.result.matches.length > 0 && (
                                            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 space-y-1.5">
                                                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" />{' '}
                                                    Kandidat duplikat
                                                </p>
                                                {dup.result.matches.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center justify-between"
                                                    >
                                                        <span className="truncate">
                                                            {m.name}{' '}
                                                            {m.phone
                                                                ? `(${m.phone})`
                                                                : ''}
                                                        </span>
                                                        {m.distance != null && (
                                                            <span className="shrink-0 ml-2">
                                                                {Math.round(
                                                                    m.distance,
                                                                )}
                                                                m
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={!!dup?.loading}
                                            onClick={() =>
                                                handleCheckDuplicate(c)
                                            }
                                            className="h-8 text-xs"
                                        >
                                            {dup?.loading ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                                <Search className="h-3 w-3 mr-1" />
                                            )}
                                            Cek duplikat
                                        </Button>
                                        <Button
                                            size="sm"
                                            disabled={isActioning}
                                            onClick={() => handleVerify(c.id)}
                                            className="h-8 text-xs"
                                        >
                                            {isActioning ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                                <CheckCircle className="h-3 w-3 mr-1" />
                                            )}
                                            Verifikasi
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={isActioning}
                                            onClick={() => handleReject(c.id)}
                                            className="h-8 text-xs"
                                        >
                                            {isActioning ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                                <XCircle className="h-3 w-3 mr-1" />
                                            )}
                                            Tolak
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
