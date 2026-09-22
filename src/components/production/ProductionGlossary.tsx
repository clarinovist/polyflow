'use client';

import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

/** Contextual guidance; action availability and validation remain authoritative. */
export function ProductionGlossary() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="min-h-11 gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Panduan SPK
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Panduan Surat Perintah Kerja</DialogTitle>
                    <DialogDescription>
                        Satu SPK untuk satu tahap produksi. Ikuti kesiapan bahan
                        dan aksi yang tersedia pada status SPK.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm leading-relaxed">
                    <section className="rounded-lg border p-4">
                        <h3 className="font-semibold">1. Produk & target</h3>
                        <p className="mt-2 text-muted-foreground">
                            Pilih tahap, produk, dan resep (BOM). Target dapat
                            diisi dalam satuan dasar, satuan jual yang tersedia,
                            atau batch. Periksa konversi sebelum melanjutkan.
                            Mesin dapat ditentukan kemudian.
                        </p>
                    </section>
                    <section className="rounded-lg border p-4">
                        <h3 className="font-semibold">2. Bahan & tujuan</h3>
                        <p className="mt-2 text-muted-foreground">
                            Asal bahan, lokasi pemakaian, dan penyimpanan hasil
                            adalah tiga hal berbeda. Mode Transfer memindahkan
                            bahan ke lokasi pemakaian. Mode Langsung tersedia
                            untuk Packing non-maklon dan memotong stok dari asal
                            tiap bahan saat hasil dicatat.
                        </p>
                        <p className="mt-2 text-muted-foreground">
                            Customer tujuan adalah informasi tujuan, bukan
                            pembagian jumlah. Pada maklon, customer pemilik
                            bahan dan estimasi jasa diisi terpisah.
                        </p>
                    </section>
                    <section className="rounded-lg border p-4">
                        <h3 className="font-semibold">3. Periksa & buat</h3>
                        <p className="mt-2 text-muted-foreground">
                            Periksa jumlah dan gudang setiap bahan. Penyesuaian
                            bahan berlaku pada SPK ini, bukan resep utama.
                            Kekurangan dapat menghasilkan status Menunggu Bahan;
                            estimasi stok bukan reservasi.
                        </p>
                    </section>
                    <details className="rounded-lg border p-4">
                        <summary className="cursor-pointer font-semibold">
                            Status & pencatatan produksi
                        </summary>
                        <div className="mt-3 space-y-2 text-muted-foreground">
                            <p>
                                Draft → Siap Produksi → Sedang Diproduksi →
                                Produksi Selesai. Menunggu Bahan menunjukkan
                                kebutuhan bahan perlu ditindaklanjuti.
                                Pembatalan mengikuti kondisi transaksi pada SPK.
                            </p>
                            <p>
                                Atur shift dan operator di tab Bahan, tim &
                                kualitas. Catat hasil, scrap, serta inspeksi
                                sesuai aktivitas. Entri hasil yang di-void tetap
                                terlihat dalam riwayat.
                            </p>
                            <p>
                                Tanggal produksi mengikuti WIB. Laporan dapat
                                mengikuti tanggal produksi, sedangkan pembukuan
                                stok dan jurnal dilakukan saat penyimpanan.
                            </p>
                        </div>
                    </details>
                    <details className="rounded-lg border p-4">
                        <summary className="cursor-pointer font-semibold">
                            Scrap, kualitas & biaya
                        </summary>
                        <div className="mt-3 space-y-2 text-muted-foreground">
                            <p>
                                Hasil bagus dan scrap dicatat terpisah. Hasil
                                bagus nol dengan scrap tetap dapat dicatat.
                                Jangan menjumlahkan satuan yang berbeda.
                            </p>
                            <p>
                                QC menggunakan hasil Lulus (PASS), Gagal (FAIL),
                                atau Karantina (QUARANTINE). Bandingkan
                                pengukuran dengan standar kualitas yang berlaku.
                            </p>
                            <p>
                                Biaya material memakai valuasi saat pengeluaran;
                                rincian biaya dan isu dapat dilihat pada tab
                                Biaya & Isu.
                            </p>
                        </div>
                    </details>
                    <div className="flex flex-wrap gap-3">
                        <Button asChild variant="outline">
                            <Link href="/production/boms">Lihat resep</Link>
                        </Button>
                        <Button asChild variant="outline">
                            <Link href="/production/orders">Daftar SPK</Link>
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
