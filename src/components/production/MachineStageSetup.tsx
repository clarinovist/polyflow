'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    getMachineStageSettings,
    saveMachineStageSettings,
} from '@/actions/production/machine-stage-settings';
import {
    DEFAULT_CATEGORY_MACHINE_MAP,
    KNOWN_MACHINE_TYPES,
    STAGE_KEYS,
    MachineStageMap,
} from '@/lib/production/machine-compatibility';

const STAGE_LABELS: Record<string, string> = {
    MIXING: 'Mixing',
    EXTRUSION: 'Extrusion',
    PACKING: 'Packing',
    REWORK: 'Rework',
    STANDARD: 'Standard',
};

export function MachineStageSetup() {
    const [map, setMap] = useState<MachineStageMap | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, startSaving] = useTransition();

    useEffect(() => {
        let mounted = true;
        getMachineStageSettings().then((res) => {
            if (!mounted) return;
            if (res.success && res.data) setMap(res.data);
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
                    Memuat setup stage...
                </CardContent>
            </Card>
        );
    }

    if (!map) return null;

    const toggle = (stage: string, type: string) => {
        setMap((prev) => {
            if (!prev) return prev;
            const current = prev[stage] || [];
            const next = current.includes(type)
                ? current.filter((t) => t !== type)
                : [...current, type];
            return { ...prev, [stage]: next };
        });
    };

    const handleSave = () => {
        startSaving(async () => {
            const res = await saveMachineStageSettings(
                map as unknown as Parameters<
                    typeof saveMachineStageSettings
                >[0],
            );
            if (res.success) {
                toast.success('Setup stage mesin tersimpan.');
            } else {
                toast.error(res.error || 'Gagal menyimpan setup stage.');
            }
        });
    };

    return (
        <Card className="bg-background/40 backdrop-blur-xl border-white/10 overflow-hidden shadow-xl">
            <CardHeader className="border-b border-white/5">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-base">
                                Setup Stage Mesin
                            </CardTitle>
                            <CardDescription>
                                Atur tipe mesin mana yang tersedia di setiap
                                stage produksi (BOM category). Berlaku untuk
                                tenant ini.
                            </CardDescription>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="sm"
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Simpan
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-4 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="text-left py-2 pr-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                                Stage
                            </th>
                            {KNOWN_MACHINE_TYPES.map((type) => (
                                <th
                                    key={type}
                                    className="text-center py-2 px-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider"
                                >
                                    {type.replace('_', ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {STAGE_KEYS.map((stage) => (
                            <tr
                                key={stage}
                                className="border-b border-white/5 last:border-0"
                            >
                                <td className="py-2 pr-4 font-semibold">
                                    {STAGE_LABELS[stage] || stage}
                                </td>
                                {KNOWN_MACHINE_TYPES.map((type) => {
                                    const checked = (
                                        map[stage] || []
                                    ).includes(type);
                                    return (
                                        <td
                                            key={type}
                                            className="text-center py-2 px-2"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() =>
                                                    toggle(stage, type)
                                                }
                                                aria-label={`${STAGE_LABELS[stage] || stage} — ${type}`}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-3">
                    Default:{' '}
                    {STAGE_KEYS.map(
                        (stage) =>
                            `${STAGE_LABELS[stage] || stage}: ${(DEFAULT_CATEGORY_MACHINE_MAP[stage] || []).join(', ')}`,
                    ).join('  •  ')}
                </p>
            </CardContent>
        </Card>
    );
}
