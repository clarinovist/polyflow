import LoginForm from '@/components/auth/login-form';

export default function LoginPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[linear-gradient(135deg,#f5f7fa_0%,#c3cfe2_100%)]">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none"></div>

            {/* Aesthetic background blobs */}
            <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
            <div className="absolute top-1/3 -right-20 w-80 h-80 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-1/2 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

            <div className="relative z-10 w-full max-w-md">
                <LoginForm />
            </div>

            <footer className="relative z-10 mt-8 text-center text-gray-400 text-sm">
                &copy; {new Date().getFullYear()} PolyFlow ERP Systems. Performance through precision.
            </footer>
        </main>
    );
}
