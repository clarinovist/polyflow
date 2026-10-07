'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, PackagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    createMaintenanceRequest,
    submitMaintenanceRequest,
} from '@/actions/production/maintenance';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/utils';

interface SparePartDraft {
    key: string;
    name: string;
    spec: string;
    quantity: string;
    note: string;
    productVariantId: string;
    sourceLocationId: string;
}
interface CatalogItem {
    id: string;
    name: string;
    skuCode: string;
}
interface LocationOption {
    id: string;
    name: string;
    slug: string;
}
interface MachineOption {
    id: string;
    name: string;
    code: string;
    status: string;
}

const URGENCIES = [
    { value: 'LOW', label: 'Rendah', help: 'Mesin masih dapat beroperasi' },
    { value: 'NORMAL', label: 'Normal', help: 'Perlu dijadwalkan segera' },
    { value: 'URGENT', label: 'Mendesak', help: 'Mengganggu proses produksi' },
] as const;

function newPart(key: string): SparePartDraft {
    return {
        key,
        name: '',
        spec: '',
        quantity: '',
        note: '',
        productVariantId: '',
        sourceLocationId: '',
    };
}

export function MaintenanceForm({
    machines,
    spareCatalog,
    locations,
    canManageSpareParts,
}: {
    machines: MachineOption[];
    spareCatalog: CatalogItem[];
    locations: LocationOption[];
    canManageSpareParts: boolean;
}) {
    const router = useRouter();
    const [machineId, setMachineId] = useState('');
    const [complaint, setComplaint] = useState('');
    const [urgency, setUrgency] = useState<'LOW' | 'NORMAL' | 'URGENT'>('NORMAL');
    const [stopped, setStopped] = useState(false);
    const [partsOpen, setPartsOpen] = useState(false);
    const [parts, setParts] = useState<SparePartDraft[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    const selectedMachine = useMemo(
        () => machines.find((machine) => machine.id === machineId),
        [machineId, machines],
    );

    const addPart = () => {
        setPartsOpen(true);
        setParts((current) => [
            ...current,
            newPart('part-' + Date.now() + '-' + current.length),
        ]);
    };
    const updatePart = (key: string, patch: Partial<SparePartDraft>) => {
        setParts((current) =>
            current.map((part) =>
                part.key === key ? { ...part, ...patch } : part,
            ),
        );
        setErrors((current) => {
            const next = { ...current };
            delete next['part-' + key];
            return next;
        });
    };
    const chooseCatalog = (key: string, productVariantId: string) => {
        const item = spareCatalog.find((entry) => entry.id === productVariantId);
        updatePart(key, {
            productVariantId,
            ...(item ? { name: item.name } : {}),
        });
    };
    const removePart = (key: string) => {
        setParts((current) => current.filter((part) => part.key !== key));
    };

    const validate = () => {
        const nextErrors: Record<string, string> = {};
        if (!machineId) nextErrors.machine = 'Pilih mesin yang mengalami gangguan.';
        if (complaint.trim().length < 5) {
            nextErrors.complaint = 'Jelaskan keluhan minimal 5 karakter.';
        }
        for (const part of parts) {
            const hasAnyValue = Boolean(
                part.name.trim() ||
                    part.quantity.trim() ||
                    part.productVariantId ||
                    part.spec.trim() ||
                    part.note.trim(),
            );
            if (
                hasAnyValue &&
                (!part.name.trim() || !(Number.parseFloat(part.quantity) > 0))
            ) {
                nextErrors['part-' + part.key] =
                    'Lengkapi nama dan jumlah part, atau hapus baris ini.';
            }
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || !validate()) return;

        const spareParts = parts
            .filter(
                (part) =>
                    part.name.trim() && Number.parseFloat(part.quantity) > 0,
            )
            .map((part) => ({
                ...(part.productVariantId
                    ? { productVariantId: part.productVariantId }
                    : {}),
                ...(part.sourceLocationId
                    ? { sourceLocationId: part.sourceLocationId }
                    : {}),
                name: part.name.trim(),
                ...(part.spec.trim() ? { spec: part.spec.trim() } : {}),
                quantity: Number.parseFloat(part.quantity),
                ...(part.note.trim() ? { note: part.note.trim() } : {}),
            }));

        setBusy(true);
        try {
            const created = await createMaintenanceRequest({
                machineId,
                complaint: complaint.trim(),
                urgency,
                machineStopped: stopped,
                clientRequestId: crypto.randomUUID(),
                spareParts,
            });
            if (!created.success) {
                toast.error(created.error || 'Gagal membuat laporan.');
                return;
            }
            const submitted = await submitMaintenanceRequest(created.data.id);
            if (!submitted.success) {
                toast.error(
                    submitted.error ||
                        'Laporan tersimpan sebagai draft. Kirim ulang dari detail laporan.',
                );
                router.push(
                    '/production/mobile/maintenance/' + created.data.id,
                );
                return;
            }
            toast.success('Laporan ' + created.data.orderNumber + ' terkirim.');
            router.push('/production/mobile/maintenance/' + created.data.id);
            router.refresh();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Gagal mengirim laporan.',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-6">
            <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        1 · Mesin dan masalah
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pilih mesin lalu tulis gejala yang terlihat atau terdengar.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="maintenance-machine">Mesin *</Label>
                    <select
                        id="maintenance-machine"
                        value={machineId}
                        aria-invalid={Boolean(errors.machine)}
                        aria-describedby={errors.machine ? 'machine-error' : undefined}
                        onChange={(event) => {
                            setMachineId(event.target.value);
                            setErrors((current) => ({ ...current, machine: '' }));
                        }}
                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                        <option value="">Pilih mesin...</option>
                        {machines.map((machine) => (
                            <option key={machine.id} value={machine.id}>
                                {machine.code} — {machine.name}
                            </option>
                        ))}
                    </select>
                    {errors.machine && (
                        <p id="machine-error" role="alert" className="text-xs text-destructive">
                            {errors.machine}
                        </p>
                    )}
                    {selectedMachine && (
                        <p className="text-xs text-muted-foreground">
                            Status mesin saat ini: {selectedMachine.status}
                        </p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="maintenance-complaint">Keluhan *</Label>
                    <Textarea
                        id="maintenance-complaint"
                        value={complaint}
                        aria-invalid={Boolean(errors.complaint)}
                        aria-describedby={errors.complaint ? 'complaint-error' : 'complaint-help'}
                        onChange={(event) => {
                            setComplaint(event.target.value);
                            setErrors((current) => ({ ...current, complaint: '' }));
                        }}
                        rows={4}
                        placeholder="Contoh: gear berbunyi kasar dan hasil potongan mulai miring."
                    />
                    <p id="complaint-help" className="text-xs text-muted-foreground">
                        Sertakan gejala, bagian mesin, dan kapan masalah mulai terlihat.
                    </p>
                    {errors.complaint && (
                        <p id="complaint-error" role="alert" className="text-xs text-destructive">
                            {errors.complaint}
                        </p>
                    )}
                </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        2 · Dampak ke produksi
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Informasi ini membantu Kepala Pabrik menentukan prioritas.
                    </p>
                </div>
                <fieldset>
                    <legend className="mb-2 text-sm font-medium">Urgensi</legend>
                    <div className="grid grid-cols-3 gap-2">
                        {URGENCIES.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                aria-pressed={urgency === item.value}
                                onClick={() => setUrgency(item.value)}
                                className={cn(
                                    'min-h-14 rounded-lg border px-2 py-2 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                                    urgency === item.value
                                        ? item.value === 'URGENT'
                                            ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                                            : 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                        : 'bg-background text-muted-foreground',
                                )}
                            >
                                <span className="block font-semibold">{item.label}</span>
                                <span className="mt-0.5 hidden text-[10px] leading-tight sm:block">
                                    {item.help}
                                </span>
                            </button>
                        ))}
                    </div>
                </fieldset>
                <label
                    htmlFor="maintenance-stopped"
                    className={cn(
                        'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3',
                        stopped && 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
                    )}
                >
                    <Checkbox
                        id="maintenance-stopped"
                        checked={stopped}
                        onCheckedChange={(value) => setStopped(value === true)}
                    />
                    <span className="flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <AlertTriangle className="h-4 w-4" /> Mesin berhenti
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            Mesin tidak dapat melanjutkan produksi.
                        </span>
                    </span>
                </label>
            </section>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <button
                    type="button"
                    aria-expanded={partsOpen}
                    onClick={() => setPartsOpen((value) => !value)}
                    className="flex min-h-14 w-full items-center gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <PackagePlus className="h-5 w-5 text-emerald-700" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                            3 · Kebutuhan spare part
                        </span>
                        <span className="block text-xs text-muted-foreground">
                            Opsional · {parts.length} part ditambahkan
                        </span>
                    </span>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 transition-transform',
                            partsOpen && 'rotate-180',
                        )}
                    />
                </button>

                {partsOpen && (
                    <div className="space-y-3 border-t p-4">
                        {parts.map((part, index) => (
                            <fieldset key={part.key} className="space-y-3 rounded-lg border p-3">
                                <legend className="px-1 text-xs font-semibold text-muted-foreground">
                                    Spare part {index + 1}
                                </legend>
                                <div className="space-y-1.5">
                                    <Label htmlFor={'catalog-' + part.key}>Ambil dari katalog stok</Label>
                                    <select
                                        id={'catalog-' + part.key}
                                        value={part.productVariantId}
                                        onChange={(event) =>
                                            chooseCatalog(part.key, event.target.value)
                                        }
                                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                        <option value="">Tidak terhubung ke stok</option>
                                        {spareCatalog.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.skuCode})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor={'part-name-' + part.key}>Nama part *</Label>
                                    <Input
                                        id={'part-name-' + part.key}
                                        value={part.name}
                                        onChange={(event) =>
                                            updatePart(part.key, { name: event.target.value })
                                        }
                                        placeholder="Contoh: Bearing 6205"
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <Label htmlFor={'part-spec-' + part.key}>Spesifikasi</Label>
                                        <Input
                                            id={'part-spec-' + part.key}
                                            value={part.spec}
                                            onChange={(event) =>
                                                updatePart(part.key, { spec: event.target.value })
                                            }
                                            placeholder="Ukuran / tipe"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor={'part-qty-' + part.key}>Jumlah *</Label>
                                        <Input
                                            id={'part-qty-' + part.key}
                                            inputMode="decimal"
                                            value={part.quantity}
                                            onChange={(event) =>
                                                updatePart(part.key, { quantity: event.target.value })
                                            }
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor={'part-location-' + part.key}>Lokasi sumber</Label>
                                    <select
                                        id={'part-location-' + part.key}
                                        value={part.sourceLocationId}
                                        onChange={(event) =>
                                            updatePart(part.key, { sourceLocationId: event.target.value })
                                        }
                                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                        <option value="">Cari otomatis saat selesai</option>
                                        {locations.map((location) => (
                                            <option key={location.id} value={location.id}>
                                                {location.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor={'part-note-' + part.key}>Catatan</Label>
                                    <Input
                                        id={'part-note-' + part.key}
                                        value={part.note}
                                        onChange={(event) =>
                                            updatePart(part.key, { note: event.target.value })
                                        }
                                        placeholder="Merek atau kebutuhan khusus"
                                    />
                                </div>
                                {errors['part-' + part.key] && (
                                    <p role="alert" className="text-xs text-destructive">
                                        {errors['part-' + part.key]}
                                    </p>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="min-h-11 w-full text-destructive hover:text-destructive"
                                    onClick={() => removePart(part.key)}
                                >
                                    <Trash2 className="h-4 w-4" /> Hapus part
                                </Button>
                            </fieldset>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addPart}
                            className="min-h-11 w-full border-dashed"
                        >
                            <PackagePlus className="h-4 w-4" /> Tambah spare part
                        </Button>
                    </div>
                )}
            </section>

            <Button
                disabled={busy}
                className="min-h-12 w-full bg-emerald-700 text-base hover:bg-emerald-800"
            >
                {busy ? 'Mengirim laporan...' : 'Kirim laporan'}
            </Button>
            {canManageSpareParts && (
                <Link
                    href="/production/maintenance/stock"
                    className="flex min-h-11 items-center justify-center text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                    Kelola stok spare part
                </Link>
            )}
        </form>
    );
}
