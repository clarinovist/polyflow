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
import { MapPin, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    getAttendanceSettings,
    saveAttendanceSettings,
    type AttendanceSettings,
} from '@/actions/admin/attendance-settings';

const defaultSettings: AttendanceSettings = {
    selfServiceEnabled: false,
    geofenceEnabled: false,
    latitude: '',
    longitude: '',
    radiusMeters: '100',
    maxAccuracyMeters: '50',
    lateGraceMinutes: '0',
};

export function AttendanceSettingsPanel() {
    const [settings, setSettings] = useState<AttendanceSettings>(defaultSettings);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

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
                            setSettings((s) => ({ ...s, selfServiceEnabled: v }))
                        }
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label>Geofence</Label>
                        <p className="text-sm text-muted-foreground">
                            Validasi lokasi karyawan saat absensi
                        </p>
                    </div>
                    <Switch
                        checked={settings.geofenceEnabled}
                        onCheckedChange={(v) =>
                            setSettings((s) => ({ ...s, geofenceEnabled: v }))
                        }
                    />
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
                                setSettings((s) => ({ ...s, latitude: e.target.value }))
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
                                setSettings((s) => ({ ...s, longitude: e.target.value }))
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
                                setSettings((s) => ({ ...s, radiusMeters: e.target.value }))
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="accuracy">Akurasi GPS Maks (meter)</Label>
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
                        <Label htmlFor="grace">Grace Period Terlambat (menit)</Label>
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
