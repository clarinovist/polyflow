'use client';

import LoginForm from '@/components/auth/login-form';
import BrandPanel from '@/components/auth/brand-panel';
import { Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminLoginClient() {
    return (
        <main className="flex min-h-screen overflow-hidden">
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-zinc-950 relative overflow-y-auto hidden-scrollbar">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.03] pointer-events-none" />

                <div className="relative z-10 w-full px-6 py-16 sm:px-12 md:max-w-2xl lg:max-w-3xl">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <div className="mb-6 text-center flex flex-col items-center">
                            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mb-4 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                                <Shield className="w-6 h-6 text-red-500" />
                            </div>
                            <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 font-medium text-red-400 text-xs border border-red-500/20 tracking-wider">
                                RESTRICTED SYSTEM ACCESS
                            </span>
                        </div>

                        <div className="bg-zinc-900/50 p-8 rounded-2xl border border-white/5 backdrop-blur-sm shadow-2xl">
                            <div className="text-zinc-100">
                                <LoginForm selectedRole="ADMIN" onBack={() => { }} />
                            </div>
                        </div>
                    </motion.div>
                </div>

                <footer className="relative z-10 mt-auto pb-6 text-center text-zinc-500 text-sm">
                    &copy; {new Date().getFullYear()} PolyFlow ERP Systems
                </footer>
            </div>

            <BrandPanel subdomain={null} />
        </main>
    );
}
