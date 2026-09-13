import { Metadata } from 'next';
import PublicNav from '@/components/home/public-nav';
import RegisterForm from './register-form';

export const metadata: Metadata = {
    title: 'Daftarkan Perusahaan | PolyFlow ERP',
    description: 'Buat workspace PolyFlow ERP baru untuk bisnis Anda.',
};

export default function RegisterPage() {
    return (
        <div className="bg-zinc-950 min-h-screen flex flex-col text-foreground selection:bg-white/10 selection:text-white pb-20">
            <PublicNav />

            <main className="flex flex-1 flex-col items-center justify-center px-4 pt-32 sm:px-6">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />

                <div className="relative z-10 w-full max-w-lg">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                            Buat workspace Anda
                        </h1>
                        <p className="text-zinc-400">
                            Siapkan PolyFlow ERP untuk tim manufaktur Anda.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:p-8">
                        <RegisterForm />
                    </div>
                </div>
            </main>
        </div>
    );
}
