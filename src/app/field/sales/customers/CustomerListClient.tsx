'use client';

import { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search,
    Phone,
    MapPin,
    ChevronRight,
    Users,
    Navigation,
    Store,
    Loader2,
} from 'lucide-react';
import Link from 'next/link';
import {
    createProspectAction,
    checkCustomerDuplicateAction,
} from '@/actions/sales/field-prospect';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

type Customer = {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    photoUrl: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    isActive: boolean;
};

interface CustomerListClientProps {
    customers: Customer[];
    showStartVisit?: boolean;
}

export function CustomerListClient({
    customers,
    showStartVisit,
}: CustomerListClientProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [routeCustomerIds, setRouteCustomerIds] = useState<Set<string>>(
        new Set(),
    );

    // Toko Baru form state
    const [showNewStore, setShowNewStore] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStorePhone, setNewStorePhone] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [duplicateWarning, setDuplicateWarning] = useState<
        { name: string; id: string }[] | null
    >(null);

    // Load today's route from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const key = `today_journey_plan_${yyyy}-${mm}-${dd}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const plan = JSON.parse(saved) as {
                    id: string;
                    status: string;
                }[];
                setRouteCustomerIds(new Set(plan.map((p) => p.id)));
            }
        }
    }, []);

    const filtered = useMemo(() => {
        if (!search) return customers;
        const q = search.toLowerCase();
        return customers.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.code?.toLowerCase().includes(q) ||
                c.phone?.includes(q),
        );
    }, [customers, search]);

    // Check duplicate before creating
    const checkDuplicate = async (name: string, phone: string) => {
        if (name.length < 3) {
            setDuplicateWarning(null);
            return;
        }
        try {
            const res = await checkCustomerDuplicateAction({
                name,
                phone: phone || undefined,
            });
            if (res?.success && res.data && res.data.isDuplicate) {
                setDuplicateWarning(res.data.matches);
            } else {
                setDuplicateWarning(null);
            }
        } catch {
            setDuplicateWarning(null);
        }
    };

    const handleCreateProspect = async () => {
        if (!newStoreName.trim()) {
            toast.error('Nama toko wajib diisi');
            return;
        }

        setIsCreating(true);
        try {
            // Get GPS location
            let latitude: number | undefined;
            let longitude: number | undefined;

            if (navigator.geolocation) {
                try {
                    const pos = await new Promise<GeolocationPosition>(
                        (resolve, reject) =>
                            navigator.geolocation.getCurrentPosition(
                                resolve,
                                reject,
                                { timeout: 5000 },
                            ),
                    );
                    latitude = pos.coords.latitude;
                    longitude = pos.coords.longitude;
                } catch {
                    // GPS not available, continue without it
                }
            }

            const res = await createProspectAction({
                name: newStoreName.trim(),
                phone: newStorePhone.trim() || undefined,
                latitude,
                longitude,
            });

            if (res?.success && res.data) {
                toast.success(`Toko "${res.data.name}" berhasil dibuat`);
                router.push(`/field/sales/customers/${res.data.id}`);
            } else {
                toast.error(
                    (res as { error?: string })?.error ||
                        'Gagal membuat toko baru',
                );
            }
        } catch {
            toast.error('Gagal membuat toko baru');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="p-4 space-y-4">
            <div>
                <h1 className="text-xl font-bold">Customer</h1>
                <p className="text-sm text-muted-foreground">Daftar outlet</p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Cari nama customer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-11"
                />
            </div>

            {/* Toko Baru — inline form */}
            {showStartVisit && !showNewStore && (
                <button
                    onClick={() => setShowNewStore(true)}
                    className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 active:scale-[0.98] transition-transform"
                >
                    <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                        <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-left">
                        <p className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">
                            Toko / Prospek Baru
                        </p>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">
                            Buat customer baru dan langsung check-in
                        </p>
                    </div>
                </button>
            )}

            {showNewStore && (
                <div className="border rounded-xl p-4 bg-card space-y-3">
                    <h3 className="font-semibold text-sm">Toko Baru</h3>
                    <Input
                        placeholder="Nama toko *"
                        value={newStoreName}
                        onChange={(e) => {
                            setNewStoreName(e.target.value);
                            checkDuplicate(e.target.value, newStorePhone);
                        }}
                        className="h-10"
                    />
                    <Input
                        placeholder="Nomor telepon (opsional)"
                        value={newStorePhone}
                        onChange={(e) => {
                            setNewStorePhone(e.target.value);
                            checkDuplicate(newStoreName, e.target.value);
                        }}
                        className="h-10"
                        type="tel"
                    />

                    {/* Duplicate warning */}
                    {duplicateWarning && duplicateWarning.length > 0 && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg text-xs">
                            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
                                Kemungkinan duplikat:
                            </p>
                            {duplicateWarning.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() =>
                                        router.push(
                                            `/field/sales/customers/${d.id}`,
                                        )
                                    }
                                    className="block w-full text-left text-amber-700 dark:text-amber-400 hover:underline py-0.5"
                                >
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setShowNewStore(false);
                                setNewStoreName('');
                                setNewStorePhone('');
                                setDuplicateWarning(null);
                            }}
                            className="flex-1"
                        >
                            Batal
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleCreateProspect}
                            disabled={isCreating || !newStoreName.trim()}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {isCreating ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Store className="h-4 w-4 mr-1" />
                            )}
                            Buat & Check-in
                        </Button>
                    </div>
                </div>
            )}

            {/* Customer List */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                        {search
                            ? 'Customer tidak ditemukan'
                            : 'Belum ada customer'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((customer) => {
                        const inRoute = routeCustomerIds.has(customer.id);
                        return (
                            <Link
                                key={customer.id}
                                href={`/field/sales/customers/${customer.id}`}
                                className="block p-3 border rounded-xl active:scale-[0.98] transition-transform"
                            >
                                <div className="flex items-start gap-3">
                                    {customer.photoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={customer.photoUrl}
                                            alt={customer.name}
                                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                            <Users className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-sm truncate">
                                                {customer.name}
                                            </h3>
                                            {!customer.isActive && (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] shrink-0"
                                                >
                                                    Non-aktif
                                                </Badge>
                                            )}
                                            {inRoute && (
                                                <Badge className="text-[10px] shrink-0 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-100 dark:border-blue-900/30">
                                                    <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                                    Di Rute
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {customer.code || '-'}
                                        </p>
                                        <div className="flex items-center gap-3 mt-1">
                                            {customer.phone && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Phone className="h-3 w-3" />
                                                    {customer.phone}
                                                </span>
                                            )}
                                            {customer.city && (
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    {customer.city}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {customer.latitude &&
                                            customer.longitude && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg"
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <Navigation className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                                </a>
                                            )}
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
