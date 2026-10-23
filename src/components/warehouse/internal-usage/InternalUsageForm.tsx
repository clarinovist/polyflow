'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Info, Loader2 } from 'lucide-react';
import { createInternalUsageAction } from '@/actions/inventory/internal-usage';
import {
    internalUsageSchema,
    type InternalUsageInput,
} from '@/lib/schemas/internal-usage';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { InternalUsageFormData } from '@/types/internal-usage';

export function InternalUsageForm({ data }: { data: InternalUsageFormData }) {
    const router = useRouter();
    const [productId, setProductId] = useState('');
    const [locationId, setLocationId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [recipient, setRecipient] = useState('');
    const [department, setDepartment] = useState('');
    const [purpose, setPurpose] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const [intent, setIntent] = useState<InternalUsageInput | null>(null);
    const retry = useRef<{ signature: string; requestId: string } | null>(null);
    const inFlight = useRef(false);
    const product = data.products.find((item) => item.id === productId);
    const stock = product?.stocks.find(
        (item) => item.locationId === locationId,
    );
    const amount = Number(quantity);
    const validQuantity = Boolean(
        stock &&
        Number.isFinite(amount) &&
        amount > 0 &&
        amount <= stock.available &&
        (product?.unit === 'KG' || Number.isInteger(amount)),
    );
    const fmt = (value: number) =>
        new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(
            value,
        );
    const quantityError =
        quantity && !validQuantity
            ? 'Isi jumlah positif sesuai satuan dan tidak melebihi stok tersedia.'
            : '';

    function review(event: FormEvent) {
        event.preventDefault();
        setError('');
        if (!product || !stock) {
            setError('Pilih barang dan gudang asal.');
            return;
        }
        if (!validQuantity) {
            setError(quantityError || 'Isi jumlah pemakaian.');
            return;
        }
        const fields = {
            productVariantId: product.id,
            locationId,
            quantity: amount,
            unit: product.unit,
            date: data.date,
            recipient: recipient.trim(),
            department: department.trim(),
            purpose: purpose.trim(),
        };
        const signature = JSON.stringify(fields);
        // Preserve the intent key on retry, but never reuse it for modified input.
        if (retry.current?.signature !== signature)
            retry.current = { signature, requestId: crypto.randomUUID() };
        const parsed = internalUsageSchema.safeParse({
            ...fields,
            requestId: retry.current.requestId,
        });
        if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
        }
        setIntent(parsed.data);
    }
    async function save() {
        if (!intent || inFlight.current) return;
        inFlight.current = true;
        setPending(true);
        setError('');
        try {
            const result = await createInternalUsageAction(intent);
            if (!result.success) {
                setError(result.error || 'Gagal mencatat pemakaian.');
                setPending(false);
                inFlight.current = false;
                return;
            }
            router.push(
                `/warehouse/internal-usage/${result.data.id}?created=1`,
            );
            router.refresh();
        } catch {
            setError(
                'Koneksi terputus. Coba konfirmasi lagi dengan isian yang sama; sistem mencegah catatan ganda.',
            );
            inFlight.current = false;
            setPending(false);
        }
    }
    if (!data.products.length)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Belum ada Barang Operasional</CardTitle>
                    <CardDescription>
                        Minta admin menambahkan ATK sebagai Barang Operasional
                        dan mencatat penerimaannya terlebih dahulu.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    return (
        <form onSubmit={review} className="space-y-4">
            {error && !intent && (
                <p
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>1. Barang yang diambil</CardTitle>
                            <CardDescription>
                                Satu barang per catatan, menggunakan satuan
                                stok.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="usage-product">Barang *</Label>
                                <Select
                                    value={productId}
                                    onValueChange={(id) => {
                                        setProductId(id);
                                        setLocationId('');
                                        setQuantity('');
                                    }}
                                >
                                    <SelectTrigger
                                        id="usage-product"
                                        className="min-h-11 w-full"
                                    >
                                        <SelectValue placeholder="Pilih Barang Operasional" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {data.products.map((item) => (
                                            <SelectItem
                                                key={item.id}
                                                value={item.id}
                                            >
                                                {item.name} · {item.skuCode}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Hanya Barang Operasional aktif. Tidak
                                    termasuk bahan produksi atau aset tetap.
                                </p>
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="usage-location">
                                        Gudang asal *
                                    </Label>
                                    <Select
                                        value={locationId}
                                        onValueChange={setLocationId}
                                        disabled={!product}
                                    >
                                        <SelectTrigger
                                            id="usage-location"
                                            className="min-h-11 w-full"
                                        >
                                            <SelectValue placeholder="Pilih gudang asal" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {product?.stocks.map((item) => (
                                                <SelectItem
                                                    key={item.locationId}
                                                    value={item.locationId}
                                                >
                                                    {item.locationName} ·{' '}
                                                    {fmt(item.available)}{' '}
                                                    {product.unit}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {product && !product.stocks.length && (
                                        <p className="text-xs text-destructive">
                                            Belum ada stok di lokasi internal.
                                            Catat penerimaan terlebih dahulu.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usage-quantity">
                                        Jumlah diambil *
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id="usage-quantity"
                                            type="number"
                                            required
                                            value={quantity}
                                            onChange={(e) =>
                                                setQuantity(e.target.value)
                                            }
                                            min={
                                                product?.unit === 'KG'
                                                    ? 0.0001
                                                    : 1
                                            }
                                            max={stock?.available}
                                            step={
                                                product?.unit === 'KG'
                                                    ? 0.0001
                                                    : 1
                                            }
                                            className="min-h-11 pr-20"
                                            aria-invalid={Boolean(
                                                quantityError,
                                            )}
                                            aria-describedby="usage-quantity-help"
                                        />
                                        <span className="absolute right-3 top-3 text-sm text-muted-foreground">
                                            {product?.unit ?? 'Satuan'}
                                        </span>
                                    </div>
                                    <p
                                        id="usage-quantity-help"
                                        className={
                                            quantityError
                                                ? 'text-xs text-destructive'
                                                : 'text-xs text-muted-foreground'
                                        }
                                    >
                                        {quantityError ||
                                            (stock
                                                ? `Tersedia ${fmt(stock.available)} ${product?.unit} · terpesan ${fmt(stock.reserved)}`
                                                : 'Pilih gudang untuk melihat stok tersedia.')}
                                    </p>
                                </div>
                            </div>
                            <div
                                className="flex flex-wrap justify-between gap-3 rounded-lg border bg-muted/40 p-4"
                                aria-live="polite"
                            >
                                <span className="text-sm text-muted-foreground">
                                    Perkiraan stok setelah dicatat
                                </span>
                                <strong className="font-mono">
                                    {stock ? fmt(stock.quantity) : '—'} →{' '}
                                    {stock && validQuantity
                                        ? fmt(stock.quantity - amount)
                                        : '—'}{' '}
                                    {product?.unit}
                                </strong>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>2. Penerima & keperluan</CardTitle>
                            <CardDescription>
                                Supaya setiap pengambilan dapat ditelusuri.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="usage-recipient">
                                        Penerima *
                                    </Label>
                                    <Input
                                        id="usage-recipient"
                                        value={recipient}
                                        onChange={(e) =>
                                            setRecipient(e.target.value)
                                        }
                                        required
                                        maxLength={100}
                                        className="min-h-11"
                                        placeholder="Nama penerima barang"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usage-department">
                                        Bagian *
                                    </Label>
                                    <Input
                                        id="usage-department"
                                        value={department}
                                        onChange={(e) =>
                                            setDepartment(e.target.value)
                                        }
                                        required
                                        maxLength={100}
                                        className="min-h-11"
                                        placeholder="Misalnya Administrasi"
                                    />
                                </div>
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="usage-date">
                                        Tanggal pemakaian
                                    </Label>
                                    <Input
                                        id="usage-date"
                                        type="date"
                                        readOnly
                                        value={data.date}
                                        className="min-h-11 bg-muted/40"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Hari ini (WIB). Pencatatan mundur belum
                                        tersedia.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="usage-actor">
                                        Dicatat oleh
                                    </Label>
                                    <Input
                                        id="usage-actor"
                                        readOnly
                                        value={data.actorName}
                                        className="min-h-11 bg-muted/40"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="usage-purpose">
                                    Keperluan *
                                </Label>
                                <Textarea
                                    id="usage-purpose"
                                    value={purpose}
                                    onChange={(e) => setPurpose(e.target.value)}
                                    required
                                    maxLength={500}
                                    placeholder="Misalnya kebutuhan administrasi kantor"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <aside className="space-y-4 xl:sticky xl:top-24">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ringkasan pemakaian</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <Badge variant="secondary">
                                Barang Operasional
                            </Badge>
                            <div>
                                <h2 className="break-words text-lg font-semibold">
                                    {product?.name || 'Belum memilih barang'}
                                </h2>
                                <p className="mt-2 text-3xl font-semibold">
                                    {validQuantity ? fmt(amount) : '—'}{' '}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {product?.unit}
                                    </span>
                                </p>
                            </div>
                            <dl className="space-y-3 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">
                                        Dari
                                    </dt>
                                    <dd className="text-right">
                                        {stock?.locationName || '—'}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="shrink-0 text-muted-foreground">
                                        Untuk bagian
                                    </dt>
                                    <dd className="break-words text-right">
                                        {department || '—'}
                                    </dd>
                                </div>
                            </dl>
                            <div className="space-y-2 border-t pt-4 text-sm">
                                <p className="flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Mengurangi stok gudang
                                </p>
                                <p className="flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Menyimpan bukti pemakaian
                                </p>
                                <p className="text-muted-foreground">
                                    Tidak terkait SPK / BOM produksi.
                                </p>
                            </div>
                            <Button
                                type="submit"
                                className="min-h-11 w-full"
                                disabled={pending}
                            >
                                Periksa pemakaian
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button
                                asChild
                                variant="ghost"
                                className="min-h-11 w-full"
                            >
                                <Link href="/warehouse/internal-usage">
                                    Batal
                                </Link>
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Stok baru berkurang setelah konfirmasi. Stok
                                tersedia akan diperiksa ulang saat disimpan.
                            </p>
                        </CardContent>
                    </Card>
                    <div className="flex gap-2 px-1 text-xs text-muted-foreground">
                        <Info className="h-4 w-4 shrink-0" />
                        <p>
                            Tidak perlu mengisi akun biaya. Finance harus
                            menyiapkan mapping beban dan dasar persediaan; ATK
                            yang sudah dibebankan saat pembelian belum dapat
                            diproses di sini.
                        </p>
                    </div>
                </aside>
            </div>
            <Dialog
                open={Boolean(intent)}
                onOpenChange={(open) => {
                    if (!open && !pending) setIntent(null);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Konfirmasi pemakaian</DialogTitle>
                        <DialogDescription>
                            Pastikan barang sudah diserahkan kepada penerima.
                            Konfirmasi akan mengurangi stok dan mencatat jurnal
                            pemakaian internal.
                        </DialogDescription>
                    </DialogHeader>
                    {intent && (
                        <dl className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                            {[
                                ['Barang', product?.name],
                                [
                                    'Jumlah',
                                    `${fmt(intent.quantity)} ${intent.unit}`,
                                ],
                                ['Gudang', stock?.locationName],
                                ['Penerima', intent.recipient],
                                ['Bagian', intent.department],
                                ['Keperluan', intent.purpose],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="grid gap-1 sm:grid-cols-[100px_1fr]"
                                >
                                    <dt className="text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="break-words font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={pending}
                            onClick={() => setIntent(null)}
                        >
                            Kembali periksa
                        </Button>
                        <Button
                            type="button"
                            className="min-h-11"
                            disabled={pending}
                            onClick={save}
                        >
                            {pending && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {pending ? 'Mencatat…' : 'Konfirmasi pemakaian'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </form>
    );
}
