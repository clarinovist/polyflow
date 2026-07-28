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
} from 'lucide-react';
import { toast } from 'sonner';
import { LiveSelfieCapture } from '@/components/hrd/LiveSelfieCapture';
import {
    selfServiceClockIn,
    selfServiceClockOut,
    getMyTodayAttendance,
} from '@/actions/employee/attendance';
import type { AttendanceRecordResult } from '@/services/hrd/attendance-service';

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

export function MyAttendanceClock() {
    const [today, setToday] = useState<TodayStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [location, setLocation] = useState<LocationState | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [pending, startTransition] = useTransition();

    const refreshStatus = useCallback(async () => {
        const result = await getMyTodayAttendance();
        if (result.success && result.data) {
            setToday(result.data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocationError('GPS tidak didukung di browser ini');
            return;
        }
        setGettingLocation(true);
        setLocationError(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                });
                setGettingLocation(false);
            },
            (err) => {
                const msg =
                    err.code === err.PERMISSION_DENIED
                        ? 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.'
                        : 'Gagal mendapatkan lokasi. Coba lagi.';
                setLocationError(msg);
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    }, []);

    useEffect(() => {
        requestLocation();
    }, [requestLocation]);

    const handleClockIn = () => {
        if (!selfieFile) {
            toast.error('Ambil selfie terlebih dahulu');
            return;
        }
        if (!location) {
            toast.error('Lokasi belum tersGPS belum tersedia');
            return;
        }

        startTransition(async () => {
            try {
                // Upload selfie first
                const formData = new FormData();
                formData.append('file', selfieFile);
                const uploadRes = await fetch('/api/upload/attendance-photo', {
                    method: 'POST',
                    body: formData,
                });
                if (!uploadRes.ok) {
                    toast.error('Gagal upload foto');
                    return;
                }
                const { url } = (await uploadRes.json()) as { url: string };

                const result = await selfServiceClockIn(url, location);
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
        if (!location) {
            toast.error('Lokasi GPS belum tersedia');
            return;
        }

        startTransition(async () => {
            const result = await selfServiceClockOut(location);
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
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {location ? (
                        <span className="text-emerald-600">
                            Lokasi GPS tersedia (±{Math.round(location.accuracy)}m)
                        </span>
                    ) : gettingLocation ? (
                        <span className="text-muted-foreground">
                            Mendapatkan lokasi GPS...
                        </span>
                    ) : locationError ? (
                        <span className="text-destructive">{locationError}</span>
                    ) : (
                        <span className="text-muted-foreground">
                            Menunggu GPS...
                        </span>
                    )}
                    {!location && !gettingLocation && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={requestLocation}
                        >
                            Coba Lagi
                        </Button>
                    )}
                </div>

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
                            disabled={pending || !selfieFile || !location}
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
                        disabled={pending || !location}
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
                    <div className="space-y-2">
                        <p className="text-sm text-amber-600">
                            Anda masih memiliki sesi yang terbuka dari hari
                            sebelumnya. Silakan clock-out terlebih dahulu.
                        </p>
                        <Button
                            className="w-full h-14 text-lg font-bold uppercase"
                            variant="destructive"
                            onClick={handleClockOut}
                            disabled={pending || !location}
                        >
                            {pending ? (
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            ) : (
                                <LogOut className="h-5 w-5 mr-2" />
                            )}
                            Clock Out
                        </Button>
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
