'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Clock,
    LogIn,
    LogOut,
    AlertCircle,
    CheckCircle2,
    Loader2,
    MapPin,
} from 'lucide-react';
import {
    kioskClockIn,
    kioskClockOut,
    getKioskGeofenceInfo,
    type KioskEmployeeOption,
} from '@/actions/admin/attendance';
import { cn } from '@/lib/utils/utils';
import { EmployeeNameSearch } from '@/components/hrd/EmployeeNameSearch';
import { LiveSelfieCapture } from '@/components/hrd/LiveSelfieCapture';
import { uploadSelfieWithRetry } from './attendance-selfie-upload';
import {
    describeGeofenceProximity,
    type GeofenceConfig,
} from '@/services/hrd/attendance-location';
import {
    sampleBestPosition,
    DEFAULT_TARGET_ACCURACY_METERS,
    DEFAULT_SAMPLE_TIMEOUT_MS,
} from '@/lib/utils/geolocation-sampler';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    plannedHours: number | null;
}

interface Feedback {
    type: 'success' | 'error';
    message: string;
}

interface LogEntry {
    id: number;
    employeeCode: string;
    shiftName: string;
    isOvertime: boolean;
    message: string;
    time: string;
}

interface Props {
    shifts: Shift[];
    employees: KioskEmployeeOption[];
}

function nowWIB(): string {
    return new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    });
}

export function AttendanceKioskForm({ shifts, employees }: Props) {
    const [clock, setClock] = useState<string | null>(null);
    const [selectedShift] = useState<string>(
        shifts[0]?.id ?? '',
    );
    const [selectedEmployee, setSelectedEmployee] =
        useState<KioskEmployeeOption | null>(null);
    const [pin, setPin] = useState('');
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfieKey, setSelfieKey] = useState(0);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logId, setLogId] = useState(0);
    const [geofenceInfo, setGeofenceInfo] = useState<{
        geofence: GeofenceConfig | null;
        configInvalid: boolean;
    } | null>(null);
    const [geofenceConfigLoading, setGeofenceConfigLoading] = useState(true);
    const [geofenceConfigLoadFailed, setGeofenceConfigLoadFailed] =
        useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);

    useEffect(() => {
        setClock(nowWIB());
        const id = setInterval(() => setClock(nowWIB()), 30_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        void getKioskGeofenceInfo()
            .then((result) => {
                if (result.success && result.data) {
                    setGeofenceInfo(result.data);
                    setGeofenceConfigLoadFailed(false);
                    return;
                }
                setGeofenceConfigLoadFailed(true);
            })
            .catch(() => {
                setGeofenceConfigLoadFailed(true);
            })
            .finally(() => {
                setGeofenceConfigLoading(false);
            });
    }, []);

    const addLog = (
        code: string,
        shiftName: string,
        isOvertime: boolean,
        message: string,
    ) => {
        setLogId((prev) => prev + 1);
        setLogs((prev) =>
            [
                {
                    id: logId,
                    employeeCode: code,
                    shiftName,
                    isOvertime,
                    message,
                    time: nowWIB(),
                },
                ...prev,
            ].slice(0, 20),
        );
    };

    const resetForm = useCallback(() => {
        setSelectedEmployee(null);
        setPin('');
        setSelfieFile(null);
        setSelfieKey((k) => k + 1);
    }, []);

    const handleSelfieCapture = useCallback((file: File | null) => {
        setSelfieFile(file);
    }, []);

    const geofence = geofenceInfo?.geofence ?? null;
    const configInvalid = geofenceInfo?.configInvalid ?? false;
    const geofenceActive = !!geofence;
    const geofenceBlocked =
        geofenceConfigLoading || geofenceConfigLoadFailed || configInvalid;

    // Target accuracy: min(default, tenant maxAccuracyMeters)
    const targetAccuracy = geofence
        ? Math.min(DEFAULT_TARGET_ACCURACY_METERS, geofence.maxAccuracyMeters)
        : DEFAULT_TARGET_ACCURACY_METERS;

    async function fetchFreshLocation(): Promise<{
        latitude: number;
        longitude: number;
        accuracy: number;
    } | null> {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
        setGettingLocation(true);
        try {
            const result = await sampleBestPosition({
                targetAccuracyMeters: targetAccuracy,
                timeoutMs: DEFAULT_SAMPLE_TIMEOUT_MS,
            });
            if (result.sample) {
                return result.sample;
            }
            return null;
        } finally {
            setGettingLocation(false);
        }
    }

    const handleClockIn = async () => {
        if (!selectedEmployee) {
            setFeedback({ type: 'error', message: 'Pilih karyawan dulu' });
            return;
        }
        if (!pin.trim()) {
            setFeedback({ type: 'error', message: 'Masukkan PIN' });
            return;
        }
        if (!selfieFile) {
            setFeedback({
                type: 'error',
                message: 'Ambil selfie terlebih dahulu',
            });
            return;
        }
        const shiftToUse = selectedShift || shifts[0]?.id || undefined;

        setLoading(true);
        setFeedback(null);
        try {
            let freshLocation: { latitude: number; longitude: number; accuracy: number } | null = null;
            if (geofenceActive) {
                freshLocation = await fetchFreshLocation();
                if (!freshLocation) {
                    setFeedback({
                        type: 'error',
                        message: 'Gagal mendapatkan lokasi GPS. Aktifkan GPS dan coba lagi.',
                    });
                    setLoading(false);
                    return;
                }
                // Precheck proximity before upload
                const prox = describeGeofenceProximity(geofence, freshLocation);
                if (prox.kind === 'outside' || prox.kind === 'accuracy-poor') {
                    setFeedback({ type: 'error', message: prox.message });
                    setLoading(false);
                    return;
                }
            }

            const { url: photoUrl, error: uploadErr } =
                await uploadSelfieWithRetry(
                    selfieFile,
                    selectedEmployee.id,
                    'clock_in',
                );
            if (!photoUrl) {
                setFeedback({
                    type: 'error',
                    message: uploadErr || 'Gagal mengunggah foto selfie. Cek koneksi / R2.',
                });
                return;
            }

            const result = await kioskClockIn(
                selectedEmployee.code,
                pin,
                shiftToUse,
                photoUrl,
                freshLocation ?? undefined,
            );
            if (result.success && result.data) {
                const d = result.data;
                const shiftName =
                    d.shiftName || shifts.find((s) => s.id === shiftToUse)?.name || '';
                const msg = d.isOvertimeShift
                    ? `${d.employeeName} · LEMBUR · ${shiftName}`
                    : `${d.employeeName} · ${shiftName} · ${nowWIB()}`;
                setFeedback({ type: 'success', message: msg });
                addLog(d.employeeCode, shiftName, d.isOvertimeShift, 'MASUK');
                resetForm();
            } else {
                setFeedback({
                    type: 'error',
                    message: result.error || 'Gagal clock-in',
                });
            }
        } catch (err) {
            const errMsg =
                err instanceof Error && err.message
                    ? err.message
                    : 'Koneksi terputus. Periksa jaringan internet dan coba lagi.';
            setFeedback({ type: 'error', message: errMsg });
        } finally {
            setLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!selectedEmployee) {
            setFeedback({ type: 'error', message: 'Pilih karyawan dulu' });
            return;
        }
        if (!pin.trim()) {
            setFeedback({ type: 'error', message: 'Masukkan PIN' });
            return;
        }

        setLoading(true);
        setFeedback(null);
        try {
            let freshLocation: { latitude: number; longitude: number; accuracy: number } | null = null;
            if (geofenceActive) {
                freshLocation = await fetchFreshLocation();
                if (!freshLocation) {
                    setFeedback({
                        type: 'error',
                        message: 'Gagal mendapatkan lokasi GPS. Aktifkan GPS dan coba lagi.',
                    });
                    setLoading(false);
                    return;
                }
                // Precheck proximity before upload
                const prox = describeGeofenceProximity(geofence, freshLocation);
                if (prox.kind === 'outside' || prox.kind === 'accuracy-poor') {
                    setFeedback({ type: 'error', message: prox.message });
                    setLoading(false);
                    return;
                }
            }

            let photoUrl: string | undefined;
            if (selfieFile) {
                const up = await uploadSelfieWithRetry(
                    selfieFile,
                    selectedEmployee.id,
                    'clock_out',
                );
                if (!up.url && up.error) {
                    console.warn('Selfie upload failed on clock-out:', up.error);
                }
                photoUrl = up.url || undefined;
            }

            const result = await kioskClockOut(
                selectedEmployee.code,
                pin,
                photoUrl,
                freshLocation ?? undefined,
            );
            if (result.success && result.data) {
                const d = result.data;
                const ot =
                    d.overtimeHours > 0
                        ? ` · +${d.overtimeHours}h lembur jam`
                        : '';
                setFeedback({
                    type: 'success',
                    message: `${d.employeeName} pulang ${d.actualHours?.toFixed(1)}j${ot}`,
                });
                addLog(d.employeeCode, d.shiftName, false, 'PULANG');
                resetForm();
            } else {
                setFeedback({
                    type: 'error',
                    message: result.error || 'Gagal clock-out',
                });
            }
        } catch (err) {
            const errMsg =
                err instanceof Error && err.message
                    ? err.message
                    : 'Koneksi terputus. Periksa jaringan internet dan coba lagi.';
            setFeedback({ type: 'error', message: errMsg });
        } finally {
            setLoading(false);
        }
    };

    const canClockIn =
        !!selectedEmployee &&
        !!pin.trim() &&
        !!selfieFile &&
        !loading &&
        !geofenceBlocked;
    const canClockOut = !!selectedEmployee && !!pin.trim() && !loading && !geofenceBlocked;

    return (
        <div className="flex flex-col gap-4 md:gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">
                    Absensi
                </h1>
                <div className="bg-muted px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium border">
                    <Clock className="h-4 w-4 text-primary" />
                    {clock ?? '--:--'} WIB
                </div>
            </div>

            {configInvalid ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Konfigurasi geofence belum lengkap. Hubungi admin.
                </div>
            ) : geofenceConfigLoadFailed ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Gagal memuat konfigurasi absensi. Muat ulang halaman.
                </div>
            ) : geofenceConfigLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat konfigurasi absensi...
                </div>
            ) : null}

            {geofenceActive && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>Geofence aktif — lokasi GPS diperlukan</span>
                    {gettingLocation && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                </div>
            )}

            <div className="bg-card rounded-2xl border-2 p-4 md:p-6 space-y-4">
                <EmployeeNameSearch
                    employees={employees}
                    selected={selectedEmployee}
                    onSelect={setSelectedEmployee}
                    disabled={loading}
                />

                <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">
                        PIN
                    </label>
                    <Input
                        type="password"
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) =>
                            setPin(
                                e.target.value.replace(/\D/g, '').slice(0, 6),
                            )
                        }
                        placeholder="••••"
                        className="h-14 text-lg font-bold tracking-[0.5em]"
                        maxLength={6}
                        autoComplete="off"
                        disabled={loading}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && canClockIn)
                                void handleClockIn();
                        }}
                    />
                </div>

                <LiveSelfieCapture
                    key={selfieKey}
                    onCapture={handleSelfieCapture}
                    disabled={loading}
                    label="Selfie (wajib untuk MASUK)"
                />

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        size="lg"
                        className="h-16 text-lg font-black uppercase tracking-wider"
                        onClick={() => void handleClockIn()}
                        disabled={!canClockIn}
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                            <LogIn className="mr-2 h-5 w-5" />
                        )}
                        MASUK
                    </Button>
                    <Button
                        size="lg"
                        variant="outline"
                        className="h-16 text-lg font-black uppercase tracking-wider border-2"
                        onClick={() => void handleClockOut()}
                        disabled={!canClockOut}
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                            <LogOut className="mr-2 h-5 w-5" />
                        )}
                        PULANG
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                    MASUK wajib selfie kamera live · PULANG selfie opsional ·
                    PIN wajib
                </p>
            </div>

            {feedback && (
                <div
                    className={cn(
                        'flex items-center gap-3 p-4 rounded-xl border-2 text-sm font-medium',
                        feedback.type === 'success'
                            ? 'bg-green-500/5 border-green-500/20 text-green-700'
                            : 'bg-destructive/5 border-destructive/20 text-destructive',
                    )}
                >
                    {feedback.type === 'success' ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                    ) : (
                        <AlertCircle className="h-5 w-5 shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                </div>
            )}

            {logs.length > 0 && (
                <div className="bg-card rounded-xl border p-3 space-y-1 max-h-64 overflow-y-auto">
                    {logs.map((l) => (
                        <div
                            key={l.id}
                            className="flex items-center gap-3 text-sm py-1 border-b border-border/50 last:border-0"
                        >
                            <span className="text-muted-foreground font-mono text-xs w-12">
                                {l.time}
                            </span>
                            <Badge
                                variant={
                                    l.message === 'MASUK'
                                        ? 'default'
                                        : 'secondary'
                                }
                                className="text-xs"
                            >
                                {l.message}
                            </Badge>
                            <span className="font-medium">
                                {l.employeeCode}
                            </span>
                            <span className="text-muted-foreground">
                                · {l.shiftName}
                            </span>
                            {l.isOvertime && (
                                <Badge className="bg-orange-500/10 text-orange-600 text-xs">
                                    LEMBUR
                                </Badge>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
