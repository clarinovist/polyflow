'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    getProductionAlertThresholds,
    saveProductionAlertThresholds,
} from '@/actions/production/alert-threshold-settings';
import {
    DEFAULT_PRODUCTION_ALERT_THRESHOLDS,
    type ProductionAlertThresholds,
} from '@/lib/production/alert-thresholds';

interface ThresholdField {
    key: keyof ProductionAlertThresholds;
    label: string;
    unit: string;
    helper: string;
}

const FIELDS: ThresholdField[] = [
    {
        key: 'scrapWarningPercent',
        label: 'Scrap Warning',
        unit: '%',
        helper: 'Scrap rate di atas nilai ini ditandai warning.',
    },
    {
        key: 'scrapAnomalyPercent',
        label: 'Scrap Anomali',
        unit: '%',
        helper: 'Scrap rate di atas nilai ini ditandai anomali.',
    },
    {
        key: 'scrapCriticalQuantity',
        label: 'Scrap Kritis',
        unit: 'unit',
        helper: 'Jumlah scrap harian di atas nilai ini dianggap kritis.',
    },
    {
        key: 'downtimeCriticalMinutes',
        label: 'Downtime Kritis',
        unit: 'menit',
        helper: 'Downtime di atas nilai ini ditandai kritis.',
    },
    {
        key: 'lowThroughputPerHour',
        label: 'Throughput Rendah',
        unit: 'unit/jam',
        helper: 'Kecepatan mesin di bawah nilai ini dianggap lambat.',
    },
];

function toFormValues(thresholds: ProductionAlertThresholds): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of FIELDS) {
        out[field.key] = String(thresholds[field.key]);
    }
    return out;
}

export function ProductionAlertSettings() {
    const [values, setValues] = useState<Record<string, string> | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        let mounted = true;
        getProductionAlertThresholds().then((res) => {
            if (!mounted) return;
            if (res.success && res.data) {
                setValues(toFormValues(res.data));
            } else {
                setValues(toFormValues({ ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS }));
            }
            setLoading(false);
        });
        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <Card className="bg-background/40 backdrop-blur-xl border-white/10 overflow-hidden shadow-xl">
                <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat pengaturan threshold...
                </CardContent>
            </Card>
        );
    }

    if (!values) return null;

    const setField = (key: string, raw: string) => {
        setValues((prev) => (prev ? { ...prev, [key]: raw } : prev));
    };

    const restoreDefaults = () => {
        setValues(toFormValues({ ...DEFAULT_PRODUCTION_ALERT_THRESHOLDS }));
    };

    const handleSave = () => {
        startSaving(async () => {
            const input = FIELDS.reduce<Record<string, number>>((acc, field) => {
                acc[field.key] = Number(values[field.key]);
                return acc;
            }, {});
            const res = await saveProductionAlertThresholds(
                input as unknown as Parameters<
                    typeof saveProductionAlertThresholds
                >[0],
            );
            if (res.success) {
                toast.success('Pengaturan threshold produksi tersimpan.');
            } else {
                toast.error(res.error || 'Gagal menyimpan pengaturan threshold.');
            }
        });
    };

    return (
        <Card className="bg-background/40 backdrop-blur-xl border-white/10 overflow-hidden shadow-xl">
            <CardHeader className="border-b border-white/5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-base">
                                Pengaturan Alert Produksi
                            </CardTitle>
                            <CardDescription>
                                Ambang batas alert scrap, downtime, dan throughput.
                                Berlaku untuk tenant ini.
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={restoreDefaults}
                            variant="outline"
                            size="sm"
                            disabled={saving}
                        >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Pulihkan default
                        </Button>
                        <Button onClick={handleSave} disabled={saving} size="sm">
                            {saving ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Simpan
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {FIELDS.map((field) => (
                        <div key={field.key}>
                            <Label
                                htmlFor={`threshold-${field.key}`}
                                className="text-xs font-semibold text-muted-foreground"
                            >
                                {field.label}{' '}
                                <span className="text-[10px]">({field.unit})</span>
                            </Label>
                            <Input
                                id={`threshold-${field.key}`}
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={values[field.key]}
                                onChange={(e) => setField(field.key, e.target.value)}
                                className="mt-1 h-9 text-sm"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {field.helper}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70">
                                Default:{' '}
                                {DEFAULT_PRODUCTION_ALERT_THRESHOLDS[field.key]}
                            </p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    Throughput rendah memakai ambang global. Ambang per mesin belum
                    didukung; nilai ini tergantung satuan output (KG, PCS, ROLL,
                    dst.) sehingga boleh berbeda dari kapasitas riil mesin.
                </div>
            </CardContent>
        </Card>
    );
}
