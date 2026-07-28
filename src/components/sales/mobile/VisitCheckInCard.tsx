'use client';

import { useState, useEffect } from 'react';
import {
    MapPin,
    Play,
    Square,
    AlertTriangle,
    Loader2,
    ShoppingCart,
    FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    compressImageForUpload,
    fileToDataUrl,
} from '@/lib/media/compress-image';
import Link from 'next/link';
import { startFieldVisitAction, completeFieldVisitAction } from '@/actions/sales/field-visit';

type VisitCheckInCardProps = {
    customerId: string;
    customerName: string;
    targetLatitude: number | null;
    targetLongitude: number | null;
    isOutsideRoute?: boolean;
    isProspect?: boolean;
    routePlanItemId?: string;
};

type ActiveVisit = {
    customerId: string;
    checkInTime: string;
    latitude: number;
    longitude: number;
    distance: number;
    clientVisitId?: string;
};

type VisitLog = {
    id: string;
    customerId: string;
    customerName: string;
    checkInTime: string;
    checkOutTime: string;
    durationSeconds: number;
    latitude: number;
    longitude: number;
    distance: number;
    notes: string;
    photoUrl: string | null;
    synced: boolean;
    isOutsideRoute?: boolean;
    extraReason?: string | null;
    clientVisitId?: string;
    routePlanItemId?: string;
};

type JourneyItem = {
    id: string;
    status: 'PENDING' | 'VISITING' | 'COMPLETED';
};

export function VisitCheckInCard({
    customerId,
    customerName,
    targetLatitude,
    targetLongitude,
    isOutsideRoute = false,
    isProspect = false,
    routePlanItemId,
}: VisitCheckInCardProps) {
    // Lazily load active visit on mount to avoid set-state-in-effect warning
    const [activeVisit, setActiveVisit] = useState<ActiveVisit | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('active_visit');
            if (saved) {
                const parsed = JSON.parse(saved) as ActiveVisit;
                if (parsed.customerId === customerId) {
                    return parsed;
                }
            }
        }
        return null;
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timerText, setTimerText] = useState('00:00');
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [notes, setNotes] = useState('');
    const [warningMsg, setWarningMsg] = useState<string | null>(null);
    const [tempVisitData, setTempVisitData] = useState<ActiveVisit | null>(
        null,
    );
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [compressingPhoto, setCompressingPhoto] = useState(false);
    const [extraReason, setExtraReason] = useState<string | null>(
        isProspect ? 'TOKO_BARU' : null,
    );

    const handlePhotoCapture = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setCompressingPhoto(true);
        setError(null);
        try {
            const compressed = await compressImageForUpload(file, {
                fileName: `visit-${Date.now()}.jpg`,
            });
            const dataUrl = await fileToDataUrl(compressed);
            setPhotoUrl(dataUrl);
        } catch {
            setError('Gagal memproses foto. Coba ambil ulang.');
        } finally {
            setCompressingPhoto(false);
        }
    };

    // Timer interval for active visit
    useEffect(() => {
        if (!activeVisit) return;

        const interval = setInterval(() => {
            const start = new Date(activeVisit.checkInTime).getTime();
            const now = new Date().getTime();
            const diffMs = now - start;
            const diffSecs = Math.floor(diffMs / 1000);
            const mins = Math.floor(diffSecs / 60)
                .toString()
                .padStart(2, '0');
            const secs = (diffSecs % 60).toString().padStart(2, '0');
            setTimerText(`${mins}:${secs}`);
        }, 1000);

        return () => clearInterval(interval);
    }, [activeVisit]);

    // Calculate distance in meters using Haversine formula
    const getDistance = (
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ) => {
        const R = 6371e3; // Earth's radius in meters
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) *
                Math.cos(phi2) *
                Math.sin(deltaLambda / 2) *
                Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return Math.round(R * c); // return in meters
    };

    const handleCheckIn = () => {
        if (!navigator.geolocation) {
            setError('Geolocation tidak didukung oleh browser Anda.');
            return;
        }

        setLoading(true);
        setError(null);
        setWarningMsg(null);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                let distance = 0;

                if (targetLatitude && targetLongitude) {
                    distance = getDistance(
                        latitude,
                        longitude,
                        targetLatitude,
                        targetLongitude,
                    );
                }

                const clientVisitId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

                const visitData: ActiveVisit = {
                    customerId,
                    checkInTime: new Date().toISOString(),
                    latitude,
                    longitude,
                    distance,
                    clientVisitId,
                };

                // If distance > 100 meters, show warning
                if (targetLatitude && targetLongitude && distance > 100) {
                    setWarningMsg(
                        `Jarak Anda ${distance}m dari toko (Batas maksimal 100m). Apakah tetap ingin check-in?`,
                    );
                    setTempVisitData(visitData);
                    setLoading(false);
                    return;
                }

                proceedCheckIn(visitData);
            },
            (err) => {
                setLoading(false);
                setError(
                    'Gagal mengakses lokasi GPS. Pastikan izin lokasi aktif.',
                );
                console.error(err);
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const proceedCheckIn = async (visitData: ActiveVisit) => {
        // Save to localStorage first (offline-first)
        localStorage.setItem('active_visit', JSON.stringify(visitData));
        updateJourneyPlanStatus(customerId, 'VISITING');

        setActiveVisit(visitData);
        setLoading(false);
        setWarningMsg(null);
        setTempVisitData(null);

        // Best-effort server call
        try {
            await startFieldVisitAction({
                customerId,
                latitude: visitData.latitude,
                longitude: visitData.longitude,
                distance: visitData.distance,
                clientVisitId:
                    visitData.clientVisitId ||
                    `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
                routePlanItemId,
                isExtraCall: isOutsideRoute || false,
                extraReason: isOutsideRoute
                    ? extraReason || undefined
                    : undefined,
            });
        } catch {
            // Server call failed — will be synced later via VisitSyncBanner
        }
    };

    const updateJourneyPlanStatus = (
        id: string,
        status: 'PENDING' | 'VISITING' | 'COMPLETED',
    ) => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const key = `today_journey_plan_${yyyy}-${mm}-${dd}`;
        const savedPlan = localStorage.getItem(key);
        if (savedPlan) {
            const plan = JSON.parse(savedPlan) as JourneyItem[];
            const updated = plan.map((item) =>
                item.id === id ? { ...item, status } : item,
            );
            localStorage.setItem(key, JSON.stringify(updated));
        }
    };

    const handleCheckOut = () => {
        setShowCheckoutModal(true);
    };

    const submitCheckOut = async () => {
        if (!activeVisit) return;

        const checkOutTime = new Date().toISOString();
        const start = new Date(activeVisit.checkInTime).getTime();
        const end = new Date(checkOutTime).getTime();
        const durationSeconds = Math.floor((end - start) / 1000);

        const clientVisitId =
            activeVisit.clientVisitId ||
            `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        const log: VisitLog = {
            id: Math.random().toString(36).substr(2, 9),
            customerId,
            customerName,
            checkInTime: activeVisit.checkInTime,
            checkOutTime,
            durationSeconds,
            latitude: activeVisit.latitude,
            longitude: activeVisit.longitude,
            distance: activeVisit.distance,
            notes,
            photoUrl,
            synced: false,
            isOutsideRoute: isOutsideRoute || false,
            extraReason: isOutsideRoute ? extraReason : undefined,
            clientVisitId,
            routePlanItemId: routePlanItemId || undefined,
        };

        // Save to logs (for sync banner to pick up)
        const savedLogs = localStorage.getItem('visit_logs');
        const logs = savedLogs ? JSON.parse(savedLogs) : [];
        logs.unshift(log);
        localStorage.setItem('visit_logs', JSON.stringify(logs));

        // Clear active visit
        localStorage.removeItem('active_visit');

        // Mark journey plan as completed
        updateJourneyPlanStatus(customerId, 'COMPLETED');

        // Best-effort server checkout (route item → COMPLETED)
        try {
            await completeFieldVisitAction({
                clientVisitId,
                notes,
                photoUrl: photoUrl || undefined,
            });
        } catch {
            // Server call failed — will be synced later via VisitSyncBanner
        }

        setActiveVisit(null);
        setShowCheckoutModal(false);
        setNotes('');
        setPhotoUrl(null);
    };

    return (
        <div className="border rounded-xl p-4 bg-card shadow-sm space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold">Kunjungan Lapangan</h3>
                </div>
                {activeVisit ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 font-bold border-emerald-200">
                        Sedang Berkunjung
                    </Badge>
                ) : (
                    <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground font-semibold"
                    >
                        Belum Check-in
                    </Badge>
                )}
            </div>

            {error && (
                <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-lg border border-destructive/20">
                    ⚠️ {error}
                </div>
            )}

            {/* Warning check-in far distance */}
            {warningMsg && tempVisitData && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs rounded-lg border border-amber-200 dark:border-amber-900/30 space-y-2">
                    <div className="flex gap-2 items-start">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <p>{warningMsg}</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setWarningMsg(null);
                                setTempVisitData(null);
                            }}
                            className="h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 bg-transparent"
                        >
                            Batal
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => proceedCheckIn(tempVisitData)}
                            className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            Lanjutkan Check-in
                        </Button>
                    </div>
                </div>
            )}

            {/* EC Banner — Outside Route */}
            {isOutsideRoute && !activeVisit && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs rounded-lg border border-amber-200 dark:border-amber-900/30 space-y-2">
                    <div className="flex gap-2 items-start">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <p className="font-semibold">Di Luar Rute Hari Ini</p>
                    </div>
                    <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                        Kunjungan ini akan dicatat sebagai Extra Call (EC) dan
                        terpisah dari compliance rute.
                    </p>
                    <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                            Alasan kunjungan luar rute *
                        </label>
                        <select
                            value={extraReason || ''}
                            onChange={(e) =>
                                setExtraReason(e.target.value || null)
                            }
                            className="w-full h-9 px-2 border border-amber-300 rounded-lg bg-white dark:bg-amber-950/30 text-xs"
                        >
                            <option value="">Pilih alasan...</option>
                            <option value="TOKO_BARU">Toko Baru</option>
                            <option value="DEKAT_RUTE">Dekat Rute</option>
                            <option value="PERMINTAAN_DADAKAN">
                                Permintaan Dadakan
                            </option>
                            <option value="TOKO_TUTUP_GANTI">
                                Toko Tutup Ganti
                            </option>
                        </select>
                    </div>
                </div>
            )}

            {activeVisit ? (
                <div className="space-y-3">
                    {/* Active Visit UI */}
                    <div className="p-3 bg-muted/30 rounded-xl flex items-center justify-between">
                        <div className="space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                Durasi Kunjungan
                            </p>
                            <p className="text-xl font-bold font-mono text-primary animate-pulse">
                                {timerText}
                            </p>
                        </div>
                        <div className="text-right space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                Jarak Check-in
                            </p>
                            <p className="text-sm font-semibold">
                                {activeVisit.distance} meter
                            </p>
                        </div>
                    </div>

                    {/* Guided Actions — Next best actions */}
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            href={`/field/sales/orders/create?customer=${customerId}`}
                            className="flex items-center justify-center gap-2 p-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm active:scale-95 transition-transform min-h-[44px]"
                        >
                            <ShoppingCart className="h-4 w-4" />
                            Buat Order
                        </Link>
                        <Link
                            href={`/field/sales/orders/create?customer=${customerId}`}
                            className="flex items-center justify-center gap-2 p-3 bg-muted border rounded-xl font-semibold text-sm active:scale-95 transition-transform min-h-[44px]"
                        >
                            <FileText className="h-4 w-4" />
                            Buat Penawaran
                        </Link>
                    </div>

                    <Button
                        onClick={handleCheckOut}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center justify-center gap-2 h-11 rounded-xl active:scale-98 transition-all"
                    >
                        <Square className="h-4 w-4" />
                        Check-out & Simpan Laporan
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Gunakan fitur check-in ketika Anda sudah tiba di lokasi
                        toko customer untuk mencatat waktu dan rute kunjungan
                        Anda.
                    </p>
                    <Button
                        onClick={handleCheckIn}
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2 h-11 rounded-xl active:scale-98 transition-all"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Mencari Lokasi GPS...
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4 fill-current" />
                                Check-in Kunjungan
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* Checkout Modal Dialog */}
            {showCheckoutModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                    <div className="w-full max-w-md bg-background border rounded-2xl shadow-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div>
                            <h3 className="font-bold text-lg">
                                Laporan Hasil Kunjungan
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Wajib isi catatan singkat dan lampirkan foto
                                kunjungan.
                            </p>
                        </div>

                        {/* Foto Bukti Kunjungan */}
                        {photoUrl ? (
                            <div className="relative border rounded-xl overflow-hidden h-36 bg-muted/20">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photoUrl}
                                    className="w-full h-full object-cover"
                                    alt="Bukti Kunjungan"
                                />
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="absolute top-2 right-2 h-7 px-2.5 text-[10px] font-bold rounded-lg"
                                    onClick={() => setPhotoUrl(null)}
                                >
                                    Hapus Foto
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-5 bg-muted/5">
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    id="visit-photo-capture"
                                    onChange={(ev) =>
                                        void handlePhotoCapture(ev)
                                    }
                                    disabled={compressingPhoto}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={compressingPhoto}
                                    onClick={() =>
                                        document
                                            .getElementById(
                                                'visit-photo-capture',
                                            )
                                            ?.click()
                                    }
                                    className="h-10 text-xs font-semibold rounded-xl border-primary/30 text-primary hover:bg-primary/5 bg-transparent"
                                >
                                    {compressingPhoto ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                            Mengompres…
                                        </>
                                    ) : (
                                        '📸 Ambil Foto Bukti Toko'
                                    )}
                                </Button>
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                    Wajib ambil foto bukti kunjungan fisik
                                </p>
                            </div>
                        )}

                        <textarea
                            className="w-full h-24 p-3 border rounded-xl bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground"
                            placeholder="Contoh: Toko sedang ramai, customer memesan 20 pack Karung Rafia, pembayaran akan ditransfer besok pagi..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />

                        <div className="flex gap-3 justify-end pt-2 border-t">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowCheckoutModal(false);
                                    setPhotoUrl(null);
                                }}
                                className="h-10 px-4 rounded-xl text-sm"
                            >
                                Kembali
                            </Button>
                            <Button
                                onClick={submitCheckOut}
                                disabled={!notes.trim() || !photoUrl}
                                className="h-10 px-5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-sm active:scale-95 transition-transform"
                            >
                                Simpan & Selesai
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
