'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Clock,
    LogIn,
    LogOut,
    MapPin,
    Loader2,
    AlertCircle,
    CheckCircle2,
    ExternalLink,
} from 'lucide-react';
import { googleMapsUrl } from '@/lib/utils/maps';
import { toast } from 'sonner';
import { LiveSelfieCapture } from '@/components/hrd/LiveSelfieCapture';
import {
    selfServiceClockIn,
    selfServiceClockOut,
    getMyTodayAttendance,
    getMyGeofenceInfo,
} from '@/actions/employee/attendance';
import type { AttendanceRecordResult } from '@/services/hrd/attendance-service';
import {
    describeGeofenceProximity,
    type GeofenceConfig,
    type ProximityState,
} from '@/services/hrd/attendance-location';
import { LocationMapPreview } from '@/components/shared/LocationMapPreview';
import {
    sampleBestPosition,
    DEFAULT_TARGET_ACCURACY_METERS,
    DEFAULT_SAMPLE_TIMEOUT_MS,
} from '@/lib/utils/geolocation-sampler';

type TodayStatus = {
    status: 'NOT_CLOCKED_IN' | 'WORKING' | 'CLOCKED_OUT' | 'OPEN_STALE';
    record: AttendanceRecordResult | null;
    shiftName: string | null;
};

interface LocationState {
    latitude: number;
    longitude: number;
    accuracy: number;
}

type GeofenceInfo = {
    selfServiceEnabled: boolean;
    geofence: GeofenceConfig | null;
    configInvalid: boolean;
};

type IndicatorLine = { tone: string; text: string };

function describeIndicator(
    proximity: ProximityState,
    hasLocation: boolean,
    gettingLocation: boolean,
    locationError: string | null,
    accuracy: number | null,
): IndicatorLine {
    if (!hasLocation) {
        if (gettingLocation) {
            return {
                tone: 'text-muted-foreground',
                text: 'Mendapatkan lokasi GPS...',
            };
        }
        if (locationError) {
            return { tone: 'text-destructive', text: locationError };
        }
        return {
            tone: 'text-muted-foreground',
            text: 'Menunggu GPS...',
        };
    }

    switch (proximity.kind) {
        case 'no-geofence':
            return {
                tone: 'text-emerald-600',
                text: `Lokasi GPS tersedia (±${Math.round(accuracy ?? 0)}m)`,
            };
        case 'inside':
            return { tone: 'text-emerald-600', text: proximity.message };
        case 'outside':
            return { tone: 'text-destructive', text: proximity.message };
        case 'accuracy-poor':
            return { tone: 'text-amber-600', text: proximity.message };
        case 'waiting-gps':
            return {
                tone: 'text-muted-foreground',
                text: 'Menunggu GPS...',
            };
        default: {
            const exhaustive: never = proximity;
            void exhaustive;
            return { tone: 'text-muted-foreground', text: 'Menunggu GPS...' };
        }
    }
}

function blockedReason(
    proximity: ProximityState,
    selfServiceOff: boolean,
    configInvalid: boolean,
    geofenceLoadFailed: boolean,
): string {
    if (proximity.kind === 'outside' || proximity.kind === 'accuracy-poor') {
        return proximity.message;
    }
    if (selfServiceOff) {
        return 'Absensi mandiri belum diaktifkan oleh HRD.';
    }
    if (configInvalid) {
        return 'Konfigurasi absensi belum lengkap. Hubungi HRD.';
    }
    if (geofenceLoadFailed) {
        return 'Gagal memuat konfigurasi absensi. Coba muat ulang halaman.';
    }
    return 'Lokasi belum siap — tunggu GPS atau muat ulang.';
}

export function MyAttendanceClock() {
    const [today, setToday] = useState<
        (TodayStatus & { staleDate?: string }) | null
    >(null);
    const [loading, setLoading] = useState(true);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [location, setLocation] = useState<LocationState | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [geofenceInfo, setGeofenceInfo] = useState<GeofenceInfo | null>(null);
    const [geofenceLoadFailed, setGeofenceLoadFailed] = useState(false);
    const [pending, startTransition] = useTransition();

    const refreshStatus = useCallback(async () => {
        const [attendanceResult, geofenceResult] = await Promise.all([
            getMyTodayAttendance(),
            getMyGeofenceInfo(),
        ]);

        if (attendanceResult.success && attendanceResult.data) {
            setToday(attendanceResult.data);
        }

        if (geofenceResult.success && geofenceResult.data) {
            setGeofenceInfo(geofenceResult.data as GeofenceInfo);
            setGeofenceLoadFailed(false);
        } else {
            setGeofenceInfo(null);
            setGeofenceLoadFailed(true);
        }

        setLoading(false);
    }, []);

    const geofence = geofenceInfo?.geofence ?? null;
    const configInvalid = geofenceInfo?.configInvalid ?? false;
    const selfServiceOff = geofenceInfo !== null && !geofenceInfo.selfServiceEnabled;
    const isConfigBlocked = selfServiceOff || configInvalid || geofenceLoadFailed;

    // For display indicator: use stale location as preview
    const displayProximity = describeGeofenceProximity(geofence, location);

    // Target accuracy: min(default, tenant maxAccuracyMeters) when geofence active
    const targetAccuracy = geofence
        ? Math.min(DEFAULT_TARGET_ACCURACY_METERS, geofence.maxAccuracyMeters)
        : DEFAULT_TARGET_ACCURACY_METERS;

    const indicator = describeIndicator(
        displayProximity,
        !!location,
        gettingLocation,
        locationError,
        location?.accuracy ?? null,
    );

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    const requestLocation = useCallback(() => {
        if (
            typeof navigator === 'undefined' ||
            !navigator.geolocation
        ) {
            setLocationError('GPS tidak didukung di browser ini');
            return;
        }
        setGettingLocation(true);
        setLocationError(null);
        void sampleBestPosition({
            targetAccuracyMeters: targetAccuracy,
            timeoutMs: DEFAULT_SAMPLE_TIMEOUT_MS,
        }).then((result) => {
            if (result.sample) {
                setLocation({
                    latitude: result.sample.latitude,
                    longitude: result.sample.longitude,
                    accuracy: result.sample.accuracy,
                });
            } else {
                const msg = result.permissionDenied
                    ? 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.'
                    : 'Gagal mendapatkan lokasi. Coba lagi.';
                setLocationError(msg);
            }
            setGettingLocation(false);
        });
    }, [targetAccuracy]);

    useEffect(() => {
        requestLocation();
    }, [requestLocation]);

    const fetchFreshLocation = useCallback(async (): Promise<LocationState | null> => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
        setGettingLocation(true);
        setLocationError(null);
        try {
            const result = await sampleBestPosition({
                targetAccuracyMeters: targetAccuracy,
                timeoutMs: DEFAULT_SAMPLE_TIMEOUT_MS,
            });
            if (result.sample) {
                const fresh: LocationState = {
                    latitude: result.sample.latitude,
                    longitude: result.sample.longitude,
                    accuracy: result.sample.accuracy,
                };
                setLocation(fresh);
                return fresh;
            }
            if (result.permissionDenied) {
                setLocationError('Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.');
            } else {
                setLocationError('Gagal mendapatkan lokasi. Coba lagi.');
            }
            return null;
        } finally {
            setGettingLocation(false);
        }
    }, [targetAccuracy]);

    const handleClockIn = () => {
        if (!selfieFile) {
            toast.error('Ambil selfie terlebih dahulu');
            return;
        }
        if (isConfigBlocked) {
            const msg = blockedReason(
                displayProximity,
                selfServiceOff,
                configInvalid,
                geofenceLoadFailed,
            );
            toast.error(msg);
            return;
        }

        startTransition(async () => {
            // 1. Fetch fresh GPS
            const freshLocation = await fetchFreshLocation();
            if (!freshLocation) {
                toast.error('Gagal mendapatkan lokasi GPS. Aktifkan GPS dan coba lagi.');
                return;
            }

            // 2. Precheck proximity before upload
            if (geofence) {
                const freshProximity = describeGeofenceProximity(geofence, freshLocation);
                if (freshProximity.kind === 'outside' || freshProximity.kind === 'accuracy-poor') {
                    toast.error(freshProximity.message);
                    return;
                }
            }

            // 3. Upload photo
            type UploadAttempt =
                | { kind: 'nonJson'; status: number; contentType: string | null }
                | { kind: 'jsonError'; status: number; parsed: { error?: string; publicUrl?: string; url?: string } | null }
                | { kind: 'ok'; parsed: { error?: string; publicUrl?: string; url?: string } | null };

            async function doUploadAttempt(): Promise<UploadAttempt> {
                const formData = new FormData();
                formData.append('file', selfieFile!);
                formData.append('kind', 'clock_in');
                const res = await fetch('/my/api/attendance-photo', {
                    method: 'POST',
                    body: formData,
                });
                const rawText = await res.text();
                const contentType = res.headers.get('content-type');
                let parsed: { error?: string; publicUrl?: string; url?: string } | null = null;
                try {
                    const p = JSON.parse(rawText) as unknown;
                    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
                        throw new Error('not plain object');
                    }
                    parsed = p as { error?: string; publicUrl?: string; url?: string };
                } catch {
                    console.error('[uploadSelfie] non-JSON response', {
                        status: res.status,
                        contentType,
                        bodySnippet: rawText.slice(0, 300),
                    });
                    return {
                        kind: 'nonJson',
                        status: res.status,
                        contentType,
                    };
                }
                if (!res.ok) {
                    return {
                        kind: 'jsonError',
                        status: res.status,
                        parsed,
                    };
                }
                return { kind: 'ok', parsed };
            }

            try {
                const firstAttempt = await doUploadAttempt();
                let attempt: UploadAttempt = firstAttempt;
                if (firstAttempt.kind === 'nonJson') {
                    await new Promise((r) => setTimeout(r, 1000));
                    attempt = await doUploadAttempt();
                }

                if (attempt.kind === 'nonJson') {
                    toast.error(
                        'Server merespons tidak valid (bukan JSON) — kemungkinan jaringan bermasalah. Coba lagi.',
                    );
                    return;
                }
                if (attempt.kind === 'jsonError') {
                    toast.error(attempt.parsed?.error ?? 'Gagal upload foto');
                    return;
                }

                const photoUrl =
                    attempt.parsed?.publicUrl ?? attempt.parsed?.url;
                if (!photoUrl) {
                    toast.error('Gagal upload foto: URL tidak valid');
                    return;
                }

                const result = await selfServiceClockIn(photoUrl, freshLocation);
                if (result.success) {
                    toast.success('Berhasil clock-in!');
                    setSelfieFile(null);
                    await refreshStatus();
                } else {
                    toast.error(result.error ?? 'Gagal clock-in');
                }
            } catch {
                toast.error('Terjadi kesalahan');
            }
        });
    };

    const handleClockOut = () => {
        if (isConfigBlocked) {
            const msg = blockedReason(
                displayProximity,
                selfServiceOff,
                configInvalid,
                geofenceLoadFailed,
            );
            toast.error(msg);
            return;
        }

        startTransition(async () => {
            // 1. Fetch fresh GPS
            const freshLocation = await fetchFreshLocation();
            if (!freshLocation) {
                toast.error('Gagal mendapatkan lokasi GPS. Aktifkan GPS dan coba lagi.');
                return;
            }

            // 2. Precheck proximity before submit
            if (geofence) {
                const freshProximity = describeGeofenceProximity(geofence, freshLocation);
                if (freshProximity.kind === 'outside' || freshProximity.kind === 'accuracy-poor') {
                    toast.error(freshProximity.message);
                    return;
                }
            }

            // 3. Submit
            const result = await selfServiceClockOut(freshLocation);
            if (result.success) {
                toast.success('Berhasil clock-out!');
                await refreshStatus();
            } else {
                toast.error(result.error ?? 'Gagal clock-out');
            }
        });
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    const statusConfig = {
        NOT_CLOCKED_IN: {
            icon: LogIn,
            label: 'Belum Masuk',
            color: 'text-muted-foreground',
            bg: 'bg-muted/50',
        },
        WORKING: {
            icon: Clock,
            label: 'Sedang Bekerja',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
        },
        CLOCKED_OUT: {
            icon: CheckCircle2,
            label: 'Sudah Pulang',
            color: 'text-blue-600',
            bg: 'bg-blue-50',
        },
        OPEN_STALE: {
            icon: AlertCircle,
            label: 'Belum Clock-Out Kemarin',
            color: 'text-amber-600',
            bg: 'bg-amber-50',
        },
    };

    const currentStatus = today?.status ?? 'NOT_CLOCKED_IN';
    const config = statusConfig[currentStatus];
    const StatusIcon = config.icon;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Absensi Hari Ini
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Banners */}
                {selfServiceOff ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Absensi mandiri belum diaktifkan oleh HRD.
                    </div>
                ) : configInvalid ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Konfigurasi absensi belum lengkap. Hubungi HRD.
                    </div>
                ) : geofenceLoadFailed ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Gagal memuat konfigurasi absensi. Coba muat ulang halaman.
                    </div>
                ) : null}

                {/* Status */}
                <div
                    className={`flex items-center gap-3 p-4 rounded-xl ${config.bg}`}
                >
                    <StatusIcon className={`h-6 w-6 ${config.color}`} />
                    <div>
                        <p className={`font-bold ${config.color}`}>
                            {config.label}
                        </p>
                        {today?.shiftName && (
                            <p className="text-sm text-muted-foreground">
                                Shift: {today.shiftName}
                            </p>
                        )}
                        {today?.record?.clockInAt && (
                            <p className="text-sm text-muted-foreground">
                                Masuk:{' '}
                                {new Date(
                                    today.record.clockInAt,
                                ).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                        )}
                        {today?.record?.clockOutAt && (
                            <p className="text-sm text-muted-foreground">
                                Pulang:{' '}
                                {new Date(
                                    today.record.clockOutAt,
                                ).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Location indicator */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className={indicator.tone}>{indicator.text}</span>
                    {location && (
                        <a
                            href={googleMapsUrl(location.latitude, location.longitude)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                            <ExternalLink className="h-3 w-3" />
                            Buka di Google Maps
                        </a>
                    )}
                    {/* Show retry/refresh when no location, or when stale sample is outside/poor */}
                    {(!location || displayProximity.kind === 'outside' || displayProximity.kind === 'accuracy-poor') && !gettingLocation && (
                        <Button variant="ghost" size="sm" onClick={requestLocation}>
                            {displayProximity.kind === 'outside' || displayProximity.kind === 'accuracy-poor'
                                ? 'Perbarui Lokasi'
                                : 'Coba Lagi'}
                        </Button>
                    )}
                </div>

                {/* Map preview */}
                {geofence && location && (
                    <LocationMapPreview
                        latitude={geofence.latitude}
                        longitude={geofence.longitude}
                        radiusMeters={geofence.radiusMeters}
                        label="Kantor"
                        height={200}
                        interactive={false}
                        secondaryMarker={
                            location
                                ? {
                                      latitude: location.latitude,
                                      longitude: location.longitude,
                                      label: 'Anda',
                                  }
                                : null
                        }
                    />
                )}

                {/* Actions based on status */}
                {currentStatus === 'NOT_CLOCKED_IN' && (
                    <div className="space-y-4">
                        <LiveSelfieCapture
                            onCapture={setSelfieFile}
                            disabled={pending}
                            label="Selfie Clock-In (wajib)"
                        />
                        <Button
                            className="w-full h-14 text-lg font-bold uppercase"
                            onClick={handleClockIn}
                            disabled={pending || !selfieFile || isConfigBlocked}
                        >
                            {pending ? (
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            ) : (
                                <LogIn className="h-5 w-5 mr-2" />
                            )}
                            Clock In
                        </Button>
                    </div>
                )}

                {currentStatus === 'WORKING' && (
                    <Button
                        className="w-full h-14 text-lg font-bold uppercase"
                        variant="destructive"
                        onClick={handleClockOut}
                        disabled={pending || isConfigBlocked}
                    >
                        {pending ? (
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        ) : (
                            <LogOut className="h-5 w-5 mr-2" />
                        )}
                        Clock Out
                    </Button>
                )}

                {currentStatus === 'OPEN_STALE' && (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            <p className="font-semibold">
                                Sesi tanggal{' '}
                                {today?.staleDate ??
                                    (today?.record?.workDate
                                        ? new Date(
                                              today.record.workDate,
                                          ).toLocaleDateString('id-ID')
                                        : '')}{' '}
                                masih terbuka.
                            </p>
                            <p className="mt-1 text-xs text-amber-700/90">
                                Hubungi HRD untuk koreksi — absensi tanggal
                                tersebut perlu ditutup manual sebelum absen
                                hari ini.
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Tombol clock-out hanya untuk sesi hari ini. Sesi
                            lama tidak bisa ditutup dari sini agar tidak salah
                            tutup record lain.
                        </p>
                    </div>
                )}

                {currentStatus === 'CLOCKED_OUT' && (
                    <p className="text-center text-sm text-muted-foreground py-4">
                        Absensi hari ini sudah lengkap. Terima kasih!
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
