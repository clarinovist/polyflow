import { LoansManager } from '@/components/hrd/LoansManager';
import { HandCoins } from 'lucide-react';

export default function LoansPage() {
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <HandCoins className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase">Kasbon Karyawan</h1>
                    <p className="text-sm text-muted-foreground">Pengajuan kasbon dengan cicilan / lunas bulan depan (1 kasbon aktif per karyawan)</p>
                </div>
            </div>
            <LoansManager />
        </div>
    );
}
