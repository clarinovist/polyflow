import LoginForm from '@/components/auth/login-form';
import BrandPanel from '@/components/auth/brand-panel';

export default function LoginPage() {
    return (
        <main className="flex min-h-screen">
            {/* Left Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-background relative">
                {/* Subtle background pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50 pointer-events-none" />

                {/* Form Container */}
                <div className="relative z-10 w-full">
                    <LoginForm />
                </div>

                {/* Footer */}
                <footer className="relative z-10 mt-auto pb-6 text-center text-zinc-400 text-sm">
                    &copy; {new Date().getFullYear()} PolyFlow ERP Systems
                </footer>
            </div>

            {/* Right Panel - Brand */}
            <BrandPanel />
        </main>
    );
}
