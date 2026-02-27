import { Metadata } from 'next';
import PublicNav from '@/components/home/public-nav';
import RegisterForm from './register-form';

export const metadata: Metadata = {
    title: 'Register Company | PolyFlow ERP',
    description: 'Create a new PolyFlow ERP workspace for your business.',
};

export default function RegisterPage() {
    return (
        <div className="bg-zinc-950 min-h-screen flex flex-col text-foreground selection:bg-white/10 selection:text-white pb-20">
            <PublicNav />

            <main className="flex-1 flex flex-col items-center justify-center pt-32 px-6">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />

                <div className="relative z-10 w-full max-w-lg">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Create your workspace</h1>
                        <p className="text-zinc-400">Set up PolyFlow ERP for your manufacturing team.</p>
                    </div>

                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
                        <RegisterForm />
                    </div>
                </div>
            </main>

        </div>
    );
}
