'use client';

import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
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
    type KioskEmployeeOption,
} from '@/actions/admin/attendance';
import { EmployeeNameSearch } from '@/components/hrd/EmployeeNameSearch';
import { LiveSelfieCapture } from '@/components/hrd/LiveSelfieCapture';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import { KioskPill } from '@/components/kiosk/ui/KioskPill';
import { uploadSelfieWithRetry } from './attendance-selfie-upload';
import {
    sampleBestPosition,
    DEFAULT_TARGET_ACCURACY_METERS,
    DEFAULT_SAMPLE_TIMEOUT_MS,
} from '@/lib/utils/geolocation-sampler';
import type { GeofenceMode } from '@/services/hrd/attendance-location';

/** A success message stays this long, then the tablet is ready for the next person. */
export const SUCCESS_DISMISS_MS = 5000;
const HISTORY_LIMIT = 20;

interface Feedback {
    type: 'success' | 'error';
    message: string;
}

interface LogEntry {
    id: number;
    employeeName: string;
    kind: 'Masuk' | 'Pulang';
    detail: string;
    time: string;
}

interface LocationState {
    latitude: number;
    longitude: number;
    accuracy: number;
}

interface Props {
    employees: KioskEmployeeOption[];
    /** Set when the employee list could not be loaded. */
    employeesError?: string;
    /**
     * Only `enforce` makes a GPS fix mandatory here. Under `observe` the
     * coordinates are still requested and sent, but a phone that cannot produce
     * them must not be stopped — the server records what it gets and rejects
     * nobody.
     */
    geofenceMode: GeofenceMode;
    /** How long a success message stays; defaults to SUCCESS_DISMISS_MS. */
    successDismissMs?: number;
}

function nowWIB(): string {
    return new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
    });
}

const hours = (value: number) =>
    value.toLocaleString('id-ID', { maximumFractionDigits: 1 });

export function AttendanceKioskForm({
    employees,
    employeesError,
    geofenceMode,
    successDismissMs = SUCCESS_DISMISS_MS,
}: Props) {
    const isLocationRequired = geofenceMode === 'enforce';
    const [selectedEmployee, setSelectedEmployee] =
        useState<KioskEmployeeOption | null>(null);
    const [pin, setPin] = useState('');
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfieKey, setSelfieKey] = useState(0);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [location, setLocation] = useState<LocationState | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [gettingLocation, setGettingLocation] = useState(false);

    // Success messages leave by themselves; errors stay until the next try.
    useEffect(() => {
        if (feedback?.type !== 'success') return;
        const timer = setTimeout(() => setFeedback(null), successDismissMs);
        return () => clearTimeout(timer);
    }, [feedback, successDismissMs]);

    const requestLocation = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setLocationError('GPS tidak didukung di browser ini');
            setLocation(null);
            return;
        }
        setGettingLocation(true);
        setLocationError(null);
        void sampleBestPosition({
            targetAccuracyMeters: DEFAULT_TARGET_ACCURACY_METERS,
            timeoutMs: DEFAULT_SAMPLE_TIMEOUT_MS,
        }).then((result) => {
            if (result.sample) {
                setLocation({
                    latitude: result.sample.latitude,
                    longitude: result.sample.longitude,
                    accuracy: result.sample.accuracy,
                });
            } else {
                setLocation(null);
                const msg = result.permissionDenied
                    ? 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser tablet.'
                    : 'Gagal mendapatkan lokasi GPS. Coba lagi.';
                setLocationError(msg);
            }
            setGettingLocation(false);
        });
    }, []);

    // Ambil lokasi saat mount — kiosk hidup seharian, jadi fix GPS pagi tidak
    // boleh dipakai untuk absen sore.
    useEffect(() => {
        requestLocation();
    }, [requestLocation]);

    const selectedEmployeeId = selectedEmployee?.id ?? null;

    // Refresh lokasi tiap ganti karyawan — jangan pakai GPS lama saat karyawan
    // berikutnya absen.
    useEffect(() => {
        if (selectedEmployeeId) {
            requestLocation();
        }
    }, [selectedEmployeeId, requestLocation]);

    const addLog = (entry: Omit<LogEntry, 'id' | 'time'>) => {
        setLogs((prev) =>
            [
                { ...entry, id: (prev[0]?.id ?? 0) + 1, time: nowWIB() },
                ...prev,
            ].slice(0, HISTORY_LIMIT),
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

    const handleClockIn = async () => {
        if (!selectedEmployee || !pin.trim() || !selfieFile) return;
        if (isLocationRequired && !location) return;

        setLoading(true);
        setFeedback(null);
        try {
            const { url: photoUrl, error: uploadErr } =
                await uploadSelfieWithRetry(
                    selfieFile,
                    selectedEmployee.id,
                    'clock_in',
                );
            if (!photoUrl) {
                setFeedback({
                    type: 'error',
                    message:
                        uploadErr ||
                        'Gagal mengunggah foto selfie. Cek koneksi / R2.',
                });
                return;
            }

            // workShiftId sengaja undefined: server resolve dari
            // EmployeeShiftAssignment karyawan (attendance-service.ts), baru
            // fallback ke shift aktif pertama. Kiosk tidak boleh menebak shift.
            const result = await kioskClockIn(
                selectedEmployee.code,
                pin,
                undefined,
                photoUrl,
                location ?? undefined,
            );
            if (result.success && result.data) {
                const d = result.data;
                const shiftName = d.shiftName || '';
                const msg = d.isOvertimeShift
                    ? `${d.employeeName} · lembur · ${shiftName}`
                    : `${d.employeeName} · ${shiftName} · ${nowWIB()}`;
                setFeedback({ type: 'success', message: msg });
                addLog({
                    employeeName: d.employeeName,
                    kind: 'Masuk',
                    detail: d.isOvertimeShift
                        ? `lembur · ${shiftName}`
                        : shiftName,
                });
                resetForm();
            } else {
                setFeedback({
                    type: 'error',
                    message: result.error || 'Gagal absen masuk',
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
        if (!selectedEmployee || !pin.trim()) return;
        if (isLocationRequired && !location) return;

        setLoading(true);
        setFeedback(null);
        try {
            let photoUrl: string | undefined;
            if (selfieFile) {
                const up = await uploadSelfieWithRetry(
                    selfieFile,
                    selectedEmployee.id,
                    'clock_out',
                );
                if (!up.url && up.error) {
                    // Non-critical for clock-out: log but continue without photo
                    console.warn(
                        'Selfie upload failed on clock-out:',
                        up.error,
                    );
                }
                photoUrl = up.url || undefined;
            }

            const result = await kioskClockOut(
                selectedEmployee.code,
                pin,
                photoUrl,
                location ?? undefined,
            );
            if (result.success && result.data) {
                const d = result.data;
                const overtime =
                    d.overtimeHours > 0
                        ? ` · lembur ${hours(d.overtimeHours)} jam`
                        : '';
                const worked =
                    d.actualHours != null
                        ? ` · kerja ${hours(d.actualHours)} jam`
                        : '';
                setFeedback({
                    type: 'success',
                    message: `${d.employeeName} pulang${worked}${overtime}`,
                });
                addLog({
                    employeeName: d.employeeName,
                    kind: 'Pulang',
                    detail: overtime.replace(' · ', ''),
                });
                resetForm();
            } else {
                setFeedback({
                    type: 'error',
                    message: result.error || 'Gagal absen pulang',
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

    const hasRequiredLocation = !isLocationRequired || !!location;
    const canClockOut =
        !!selectedEmployee && !!pin.trim() && hasRequiredLocation && !loading;
    const canClockIn = canClockOut && !!selfieFile;
    const lockReason =
        !selectedEmployee || !pin.trim()
            ? 'Pilih nama, lalu isi PIN.'
            : !hasRequiredLocation
              ? 'Lokasi belum terbaca. Masuk dan Pulang menunggu lokasi.'
              : !selfieFile
                ? 'Ambil selfie dulu untuk Masuk. Pulang bisa tanpa selfie.'
                : null;

    return (
        <div className="grid gap-4">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                    Absensi
                </h1>
                <p className="mt-1 text-lg text-muted-foreground">
                    Untuk semua karyawan: bulanan, harian, helper.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="grid content-start gap-4 rounded-2xl border-2 border-border bg-card p-4">
                    {employeesError && (
                        <p
                            role="alert"
                            className="rounded-xl bg-kiosk-stop-soft p-3 text-base font-semibold text-kiosk-stop-ink"
                        >
                            {employeesError}
                        </p>
                    )}
                    <EmployeeNameSearch
                        employees={employees}
                        selected={selectedEmployee}
                        onSelect={setSelectedEmployee}
                        disabled={loading}
                    />

                    <div className="grid gap-1.5">
                        <label
                            htmlFor="attendance-pin"
                            className="text-base font-semibold text-muted-foreground"
                        >
                            PIN
                        </label>
                        <Input
                            id="attendance-pin"
                            type="password"
                            inputMode="numeric"
                            value={pin}
                            onChange={(e) =>
                                setPin(
                                    e.target.value
                                        .replace(/\D/g, '')
                                        .slice(0, 6),
                                )
                            }
                            placeholder="••••"
                            className="h-14 text-2xl font-bold tracking-[0.5em]"
                            maxLength={6}
                            autoComplete="off"
                            disabled={loading}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && canClockIn)
                                    void handleClockIn();
                            }}
                        />
                    </div>

                    {feedback &&
                        (feedback.type === 'success' ? (
                            <p
                                role="status"
                                className="flex items-center gap-3 rounded-xl bg-kiosk-go-soft p-3 text-base font-semibold text-kiosk-go-ink"
                            >
                                <CheckCircle2
                                    aria-hidden="true"
                                    className="size-5 shrink-0"
                                />
                                {feedback.message}
                            </p>
                        ) : (
                            <p
                                role="alert"
                                className="flex items-center gap-3 rounded-xl bg-kiosk-stop-soft p-3 text-base font-semibold text-kiosk-stop-ink"
                            >
                                <AlertCircle
                                    aria-hidden="true"
                                    className="size-5 shrink-0"
                                />
                                {feedback.message}
                            </p>
                        ))}

                    {logs.length > 0 && (
                        <section
                            aria-label="Tadi di tablet ini"
                            className="grid gap-2"
                        >
                            <h2 className="text-base font-semibold text-muted-foreground">
                                Tadi di tablet ini
                            </h2>
                            <ul className="grid max-h-64 overflow-y-auto">
                                {logs.map((log) => (
                                    <li
                                        key={log.id}
                                        className="flex flex-wrap items-center gap-3 border-b py-2 text-base last:border-0"
                                    >
                                        <span className="tabular-nums text-muted-foreground">
                                            {log.time}
                                        </span>
                                        <span className="font-semibold">
                                            {log.employeeName}
                                        </span>
                                        <KioskPill
                                            tone={
                                                log.kind === 'Masuk'
                                                    ? 'go'
                                                    : 'neutral'
                                            }
                                        >
                                            {log.kind}
                                            {log.detail && ` · ${log.detail}`}
                                        </KioskPill>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>

                <div className="grid content-start gap-4 rounded-2xl border-2 border-border bg-card p-4">
                    <LiveSelfieCapture
                        key={selfieKey}
                        onCapture={handleSelfieCapture}
                        disabled={loading}
                        label="Selfie (wajib untuk Masuk)"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                        {gettingLocation ? (
                            <KioskPill tone="warn">
                                <Loader2
                                    aria-hidden="true"
                                    className="size-4 animate-spin"
                                />
                                Mencari lokasi…
                            </KioskPill>
                        ) : location ? (
                            <KioskPill tone="go">
                                <MapPin aria-hidden="true" className="size-4" />
                                Lokasi terbaca · ±
                                {Math.round(location.accuracy)} m
                            </KioskPill>
                        ) : (
                            <>
                                <KioskPill tone="stop">
                                    <MapPin
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                    {locationError ?? 'Lokasi belum terbaca'}
                                </KioskPill>
                                <button
                                    type="button"
                                    className={kioskButton()}
                                    onClick={requestLocation}
                                >
                                    Coba lagi
                                </button>
                            </>
                        )}
                        <span className="text-base text-muted-foreground">
                            {isLocationRequired
                                ? 'Lokasi wajib untuk absen.'
                                : geofenceMode === 'observe'
                                  ? 'Lokasi dicatat, tidak wajib.'
                                  : null}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            className={kioskButton({ size: 'xl', tone: 'go' })}
                            onClick={() => void handleClockIn()}
                            disabled={!canClockIn}
                        >
                            {loading ? (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            ) : (
                                <LogIn aria-hidden="true" />
                            )}
                            Masuk
                        </button>
                        <button
                            type="button"
                            className={kioskButton({ size: 'xl' })}
                            onClick={() => void handleClockOut()}
                            disabled={!canClockOut}
                        >
                            {loading ? (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            ) : (
                                <LogOut aria-hidden="true" />
                            )}
                            Pulang
                        </button>
                    </div>
                    {lockReason && (
                        <p className="text-center text-base text-muted-foreground">
                            {lockReason}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
