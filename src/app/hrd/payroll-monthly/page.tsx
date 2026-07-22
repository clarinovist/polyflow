import Link from 'next/link';
import { PayrollMonthlyManager } from '@/components/hrd/PayrollMonthlyManager';
import { Wallet } from 'lucide-react';

export default function PayrollMonthlyPage() {
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight uppercase">Gaji Bulanan</h1>
                    <p className="text-sm text-muted-foreground">
                        Untuk payType MONTHLY (kantor). Borongan/harian →{' '}
                        <Link href="/hrd/payroll" className="text-primary font-medium hover:underline">
                            Gaji Mingguan
                        </Link>
                        . BPJS, kasbon, THR ad-hoc.
                    </p>
                </div>
            </div>
            <PayrollMonthlyManager />
        </div>
    );
}
