'use client';

import { HelpCircle, FlaskConical } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STEPS = [
    ['Isi detail formula', 'Tentukan nama, deskripsi, kategori, dan varian produk hasil.'],
    ['Tentukan jumlah dasar hasil', 'Isi jumlah hasil yang menjadi dasar kebutuhan bahan. Periksa satuan produk sebelum melanjutkan.'],
    ['Tambahkan bahan', 'Pilih bahan baku atau produk antara yang diperlukan, lalu isi jumlahnya sesuai jumlah dasar hasil.'],
    ['Periksa scrap', 'Isi persentase scrap bila relevan. Periksa kewajaran jumlah dan satuan sebelum menyimpan.'],
    ['Tentukan formula utama', 'Tandai sebagai formula utama jika ini formula yang paling sering digunakan untuk produk tersebut.'],
];

export function BOMFieldGuide() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="min-h-11">
                    <HelpCircle className="mr-2 h-4 w-4" />Panduan BOM
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" />Panduan BOM / Formula</DialogTitle>
                    <DialogDescription>Cara membaca dan menyiapkan formula produksi.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 text-sm">
                    <section className="space-y-2">
                        <h3 className="text-base font-semibold">Apa itu BOM?</h3>
                        <p className="text-muted-foreground">BOM (Bill of Materials) adalah formula yang menjelaskan produk hasil, bahan yang diperlukan, jumlah tiap bahan, dan persentase scrap yang direncanakan.</p>
                    </section>
                    <section className="space-y-3">
                        <h3 className="text-base font-semibold">Menyiapkan formula</h3>
                        <ol className="space-y-3">
                            {STEPS.map(([title, description], index) => (
                                <li key={title} className="flex gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">{index + 1}</span>
                                    <div><p className="font-medium">{title}</p><p className="text-muted-foreground">{description}</p></div>
                                </li>
                            ))}
                        </ol>
                    </section>
                    <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
                        <h3 className="text-base font-semibold">Jumlah dasar dan target SPK</h3>
                        <p className="text-muted-foreground">Jumlah bahan mengikuti perbandingan target SPK terhadap jumlah dasar hasil BOM. Contoh tanpa scrap: formula dengan hasil 100 kg dan kebutuhan bahan 98 kg + 2 kg, untuk target 500 kg menjadi 490 kg + 10 kg.</p>
                        <p className="text-muted-foreground">Contoh ini memakai satuan yang sama. Jangan menyamakan kg, zak, bal, atau satuan lain tanpa konversi yang benar. Periksa pratinjau kebutuhan bahan sebelum membuat SPK.</p>
                    </section>
                    <section className="space-y-2">
                        <h3 className="text-base font-semibold">Kapan perlu beberapa formula?</h3>
                        <p className="text-muted-foreground">Gunakan formula berbeda jika komposisi bahan, tingkat kualitas, metode proses, atau kapasitas peralatan berbeda. Satu produk dapat memiliki formula alternatif, tetapi hanya satu formula utama.</p>
                    </section>
                    <section className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-2">
                        <h3 className="text-base font-semibold">Periksa sebelum menyimpan</h3>
                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                            <li>Varian produk hasil dan seluruh bahan sudah benar.</li>
                            <li>Jumlah bahan sesuai jumlah dasar hasil, dengan satuan yang benar.</li>
                            <li>Persentase scrap wajar dan mengikuti kondisi produksi.</li>
                            <li>Nama dan deskripsi menjelaskan komposisi atau versi formula.</li>
                            <li>Perubahan formula ditinjau dan diuji melalui prosedur produksi yang berlaku.</li>
                            <li>Pertahankan riwayat formula lama; gunakan penonaktifan bila tidak lagi dipakai.</li>
                        </ul>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
