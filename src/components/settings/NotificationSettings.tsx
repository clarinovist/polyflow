'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    NOTIFICATION_CATEGORIES,
    getNotificationPrefs,
    updateNotificationPrefs,
    type NotificationPrefs,
} from '@/actions/settings/notification-actions';

export function NotificationSettings() {
    const [prefs, setPrefs] = useState<NotificationPrefs>({});
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        (async () => {
            const res = await getNotificationPrefs();
            if (res.success) {
                setPrefs(res.data);
            }
            setLoading(false);
        })();
    }, []);

    const handleToggle = (key: string, value: boolean) => {
        const next = { ...prefs, [key]: value };
        setPrefs(next);
        startSaving(async () => {
            const res = await updateNotificationPrefs(next);
            if (!res.success) {
                // revert on failure
                setPrefs((prev) => ({ ...prev, [key]: !value }));
                toast.error(res.error || 'Gagal menyimpan preferensi notifikasi.');
            }
        });
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex h-32 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Notifikasi</CardTitle>
                <CardDescription>
                    Pilih kategori notifikasi in-app yang ingin Anda terima.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {NOTIFICATION_CATEGORIES.map((cat) => (
                    <div
                        key={cat.key}
                        className="flex items-center justify-between p-3 border rounded-lg"
                    >
                        <Label htmlFor={`notif-${cat.key}`} className="cursor-pointer font-normal">
                            {cat.label}
                        </Label>
                        <Switch
                            id={`notif-${cat.key}`}
                            checked={prefs[cat.key] ?? true}
                            disabled={saving}
                            onCheckedChange={(v) => handleToggle(cat.key, v)}
                        />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
