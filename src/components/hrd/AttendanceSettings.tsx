'use client';

import { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { MapPin, Save, Loader2, Navigation, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
    getAttendanceSettings,
    saveAttendanceSettings,
    type AttendanceSettings,
} from '@/actions/admin/attendance-settings';
import { LocationMapPreview } from '@/components/shared/LocationMapPreview';
import { googleMapsUrl } from '@/lib/utils/maps';

const GEOFENCE_MODE_OPTIONS = [
    {
        value: 'off' as const,
        label: 'Mati',
        description: 'Lokasi tidak diminta dan tidak disimpan.',
    },
    {
        value: 'observe' as const,
        label: 'Observasi',
        description:
            'Koordinat dan jarak dicatat, tapi tidak ada yang ditolak. Pakai ini dulu beberapa hari untuk melihat sebaran posisi karyawan sebelum menentukan radius.',
    },
    {
        value: 'enforce' as const,
        label: 'Tegakkan',
        description:
            'Absensi di luar radius ditolak. Nyalakan hanya setelah radius terbukti benar dari data observasi — radius yang salah memblokir semua orang.',
    },
];

const defaultSettings: AttendanceSettings = {
    selfServiceEnabled: false,
    geofenceMode: 'off',
    latitude: '',
    longitude: '',
    radiusMeters: '100',
    maxAccuracyMeters: '50',
    lateGraceMinutes: '0',
};

export function AttendanceSettingsPanel() {
    const [settings, setSettings] =
        useState<AttendanceSettings>(defaultSettings);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();
    const [gettingLocation, setGettingLocation] = useState(false);

    useEffect(() => {
        getAttendanceSettings().then((result) => {
            if (result.success && result.data) {
                setSettings(result.data);
            }
            setLoading(false);
        });
    }, []);

    function handleSave() {
        startSaving(async () => {
            const result = await saveAttendanceSettings(settings);
            if (result.success) {
                toast.success('Pengaturan absensi disimpan');
            } else {
                toast.error(result.error ?? 'Gagal menyimpan pengaturan');
            }
        });
    }

    function handleUseCurrentLocation() {
        if (!navigator.geolocation) {
            toast.error('GPS tidak didukung di browser ini');
            return;
        }
        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setSettings((s) => ({
                    ...s,
                    latitude: pos.coords.latitude.toFixed(6),
                    longitude: pos.coords.longitude.toFixed(6),
                }));
                toast.success('Lokasi diperbarui dari GPS');
                setGettingLocation(false);
            },
            (err) => {
                const msg =
                    err.code === err.PERMISSION_DENIED
                        ? 'Izin lokasi ditolak. Aktifkan GPS di pengaturan browser.'
                        : 'Gagal mendapatkan lokasi. Coba lagi.';
                toast.error(msg);
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    }

    const latNum = parseFloat(settings.latitude);
    const lngNum = parseFloat(settings.longitude);
    const radiusNum = parseFloat(settings.radiusMeters);
    const coordValid =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180;

    if (loading) {
        return (
            <Card>
                <CardContent className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Pengaturan Absensi
                </CardTitle>
                <CardDescription>
                    Konfigurasi self-service dan geofence untuk absensi karyawan
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Self-Service Absensi</Label>
                        <p className="text-sm text-muted-foreground">
                            Karyawan dapat clock-in/out dari portal /my
                        </p>
                    </div>
                    <Switch
                        checked={settings.selfServiceEnabled}
                        onCheckedChange={(v) =>
                            setSettings((s) => ({
                                ...s,
                                selfServiceEnabled: v,
                            }))
                        }
                    />
                </div>

                <div className="space-y-2">
                    <Label>Geofence</Label>
                    <p className="text-sm text-muted-foreground">
                        Validasi lokasi karyawan saat absensi
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {GEOFENCE_MODE_OPTIONS.map((option) => (
                            <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={
                                    settings.geofenceMode === option.value
                                        ? 'default'
                                        : 'outline'
                                }
                                aria-pressed={
                                    settings.geofenceMode === option.value
                                }
                                onClick={() =>
                                    setSettings((s) => ({
                                        ...s,
                                        geofenceMode: option.value,
                                    }))
                                }
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {
                            GEOFENCE_MODE_OPTIONS.find(
                                (o) => o.value === settings.geofenceMode,
                            )?.description
                        }
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="latitude">Latitude Kantor</Label>
                        <Input
                            id="latitude"
                            type="text"
                            placeholder="-6.123456"
                            value={settings.latitude}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    latitude: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="longitude">Longitude Kantor</Label>
                        <Input
                            id="longitude"
                            type="text"
                            placeholder="106.123456"
                            value={settings.longitude}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    longitude: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="radius">Radius (meter)</Label>
                        <Input
                            id="radius"
                            type="number"
                            min="1"
                            value={settings.radiusMeters}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    radiusMeters: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="accuracy">
                            Akurasi GPS Maks (meter)
                        </Label>
                        <Input
                            id="accuracy"
                            type="number"
                            min="1"
                            value={settings.maxAccuracyMeters}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    maxAccuracyMeters: e.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="grace">
                            Grace Period Terlambat (menit)
                        </Label>
                        <Input
                            id="grace"
                            type="number"
                            min="0"
                            value={settings.lateGraceMinutes}
                            onChange={(e) =>
                                setSettings((s) => ({
                                    ...s,
                                    lateGraceMinutes: e.target.value,
                                }))
                            }
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleUseCurrentLocation}
                        disabled={gettingLocation}
                    >
                        {gettingLocation ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Navigation className="h-4 w-4 mr-2" />
                        )}
                        Gunakan lokasi saya saat ini
                    </Button>
                    {coordValid && (
                        <a
                            href={googleMapsUrl(latNum, lngNum)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button type="button" variant="outline" size="sm">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Buka di Google Maps
                            </Button>
                        </a>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Preview Peta Kantor & Radius</Label>
                    {coordValid ? (
                        <LocationMapPreview
                            latitude={latNum}
                            longitude={lngNum}
                            radiusMeters={
                                Number.isFinite(radiusNum) && radiusNum > 0
                                    ? radiusNum
                                    : null
                            }
                            label="Kantor"
                            height={320}
                        />
                    ) : (
                        <div className="rounded-lg border bg-muted/30 h-[320px] flex items-center justify-center text-muted-foreground">
                            <div className="flex flex-col items-center gap-2 text-xs p-4 text-center">
                                <MapPin className="h-6 w-6 opacity-50" />
                                <span>
                                    Masukkan latitude & longitude valid untuk
                                    melihat preview
                                </span>
                            </div>
                        </div>
                    )}
                    {coordValid && (
                        <p className="text-[11px] text-muted-foreground">
                            Lingkaran biru = radius geofence{' '}
                            {Number.isFinite(radiusNum) ? `${radiusNum}m` : ''}.
                            Titik biru = lokasi kantor.
                        </p>
                    )}
                </div>

                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4 mr-2" />
                    )}
                    Simpan Pengaturan
                </Button>
            </CardContent>
        </Card>
    );
}
