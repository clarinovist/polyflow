'use client';

import { useEffect, useState } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    getQualityStandardsForVariant,
    createQualityCheckParameter,
    updateQualityCheckParameter,
    deleteQualityCheckParameter,
} from '@/actions/production/production-quality-standards';

interface QcParameter {
    id: string;
    name: string;
    unit: string;
    targetValue: unknown;
    minValue: unknown;
    maxValue: unknown;
    requireMeasurement: boolean;
}

interface VariantForQc {
    id: string;
    name: string;
    skuCode: string;
}

function numOrEmpty(value: unknown) {
    return value === null || value === undefined ? '' : String(value);
}

function ParameterFormDialog({
    productVariantId,
    parameter,
    onSaved,
}: {
    productVariantId: string;
    parameter?: QcParameter;
    onSaved: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const isEdit = !!parameter;

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsPending(true);
        const formData = new FormData(e.currentTarget);
        const payload = {
            name: formData.get('name') as string,
            unit: formData.get('unit') as string,
            targetValue: formData.get('targetValue')
                ? Number(formData.get('targetValue'))
                : null,
            minValue: formData.get('minValue')
                ? Number(formData.get('minValue'))
                : null,
            maxValue: formData.get('maxValue')
                ? Number(formData.get('maxValue'))
                : null,
            requireMeasurement: formData.get('requireMeasurement') === 'on',
            sortOrder: 0,
        };

        try {
            const result = isEdit
                ? await updateQualityCheckParameter({
                      id: parameter.id,
                      ...payload,
                  })
                : await createQualityCheckParameter({
                      productVariantId,
                      ...payload,
                  });

            if (result.success) {
                toast.success(
                    isEdit
                        ? 'Parameter QC berhasil diubah.'
                        : 'Parameter QC berhasil ditambahkan.',
                );
                setOpen(false);
                onSaved();
            } else {
                toast.error(result.error || 'Gagal menyimpan parameter QC');
            }
        } catch (error) {
            toast.error('Gagal memproses. Silakan coba lagi.');
            console.error(error);
        } finally {
            setIsPending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {isEdit ? (
                    <Button variant="ghost" size="sm">
                        Edit
                    </Button>
                ) : (
                    <Button variant="outline" size="sm">
                        <Plus className="mr-1 h-3.5 w-3.5" /> Tambah Parameter
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? 'Edit Parameter QC' : 'Tambah Parameter QC'}
                    </DialogTitle>
                    <DialogDescription>
                        Standar kualitas terukur untuk varian ini (mis. panjang,
                        berat, ketipisan). Kosongkan min/maks kalau tidak perlu
                        dicek toleransinya.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="qc-param-name">Nama Parameter</Label>
                        <Input
                            id="qc-param-name"
                            name="name"
                            required
                            defaultValue={parameter?.name}
                            placeholder="contoh: Panjang Sedotan"
                            disabled={isPending}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="qc-param-unit">Satuan</Label>
                        <Input
                            id="qc-param-unit"
                            name="unit"
                            required
                            defaultValue={parameter?.unit}
                            placeholder="contoh: cm, gram, mm"
                            disabled={isPending}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="qc-param-target">Target</Label>
                            <Input
                                id="qc-param-target"
                                name="targetValue"
                                type="number"
                                step="0.01"
                                defaultValue={numOrEmpty(
                                    parameter?.targetValue,
                                )}
                                disabled={isPending}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="qc-param-min">Min</Label>
                            <Input
                                id="qc-param-min"
                                name="minValue"
                                type="number"
                                step="0.01"
                                defaultValue={numOrEmpty(parameter?.minValue)}
                                disabled={isPending}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="qc-param-max">Maks</Label>
                            <Input
                                id="qc-param-max"
                                name="maxValue"
                                type="number"
                                step="0.01"
                                defaultValue={numOrEmpty(parameter?.maxValue)}
                                disabled={isPending}
                            />
                        </div>
                    </div>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                        <input type="checkbox" name="requireMeasurement" defaultChecked={parameter ? parameter.requireMeasurement !== false : false} disabled={isPending} />
                        Wajib catat hasil ukur di kiosk
                    </label>
                    <p className="text-xs text-muted-foreground">Jika tidak dicentang, parameter hanya menjadi acuan tampilan di SPK.</p>
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isPending}
                    >
                        {isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Simpan
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function VariantQualityCard({ variant }: { variant: VariantForQc }) {
    const [parameters, setParameters] = useState<QcParameter[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = async () => {
        setLoading(true);
        const res = await getQualityStandardsForVariant(variant.id);
        if (res.success) {
            setParameters(res.data as unknown as QcParameter[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variant.id]);

    async function handleDelete(id: string) {
        if (
            !confirm(
                'Hapus parameter QC ini? Kiosk tidak akan menampilkan step ini lagi untuk varian tersebut.',
            )
        ) {
            return;
        }
        const result = await deleteQualityCheckParameter(id);
        if (result.success) {
            toast.success('Parameter QC dihapus.');
            reload();
        } else {
            toast.error(result.error || 'Gagal menghapus parameter QC');
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle className="text-base">{variant.name}</CardTitle>
                    <CardDescription>SKU: {variant.skuCode}</CardDescription>
                </div>
                <ParameterFormDialog
                    productVariantId={variant.id}
                    onSaved={reload}
                />
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
                    </div>
                ) : parameters.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-4">
                        Belum ada standar kualitas untuk varian ini. Tambahkan parameter untuk menampilkan acuan di SPK.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Parameter</TableHead>
                                <TableHead>Satuan</TableHead>
                                <TableHead className="text-right">
                                    Target
                                </TableHead>
                                <TableHead className="text-right">
                                    Min
                                </TableHead>
                                <TableHead className="text-right">
                                    Maks
                                </TableHead>
                                <TableHead className="text-right">
                                    Aksi
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parameters.map((param) => (
                                <TableRow key={param.id}>
                                    <TableCell className="font-medium">
                                        {param.name}
                                    </TableCell>
                                    <TableCell>
                                        {param.unit}
                                        <span className="block text-xs text-muted-foreground">{param.requireMeasurement !== false ? 'Wajib ukur di kiosk' : 'Acuan tampilan'}</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {numOrEmpty(param.targetValue) || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {numOrEmpty(param.minValue) || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {numOrEmpty(param.maxValue) || '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <ParameterFormDialog
                                                productVariantId={variant.id}
                                                parameter={param}
                                                onSaved={reload}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleDelete(param.id)
                                                }
                                            >
                                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

export function QualityStandardsTab({
    variants,
}: {
    variants: VariantForQc[];
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Standar kualitas terukur per varian (mis. panjang, berat,
                ketipisan). Standar otomatis tampil di SPK untuk varian ini.
                Aktifkan “Wajib catat hasil ukur di kiosk” hanya jika operator perlu
                mengisi hasil ukur. Nilai di luar toleransi tetap berupa peringatan,
                bukan pemblokiran. Mengubah standar memperbarui acuan tampilan SPK.
            </p>
            {variants.map((variant) => (
                <VariantQualityCard key={variant.id} variant={variant} />
            ))}
        </div>
    );
}
