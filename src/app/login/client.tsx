'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/auth/login-form';
import BrandPanel from '@/components/auth/brand-panel';
import RoleSelection, { RoleType } from '@/components/auth/role-selection';
import WorkspaceDiscovery from '@/components/auth/workspace-discovery';
import { AnimatePresence, motion } from 'framer-motion';

export default function LoginClient({ subdomain }: { subdomain: string | null }) {
    const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);
    const router = useRouter();

    const handleSelectRole = (role: RoleType) => {
        if (role === 'KIOSK') {
            router.push('/kiosk');
            return;
        }
        setSelectedRole(role);
    };

    const handleBack = () => {
        setSelectedRole(null);
    };

    return (
        <main className="flex min-h-screen overflow-hidden">
            {/* Left Panel - Dynamic Content */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center bg-background relative overflow-y-auto">
                {/* Subtle background pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-15 pointer-events-none" />

                <div className="relative z-10 w-full px-6 py-16 sm:px-12 md:max-w-2xl lg:max-w-3xl">
                    {subdomain ? (
                        <>
                            <div className="flex justify-center mb-10">
                                <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-800 text-sm border border-zinc-200 shadow-sm">
                                    Tenant: <strong className="ml-1 text-zinc-950 uppercase">{subdomain}</strong>
                                </span>
                            </div>
                            <AnimatePresence mode="wait">
                                {!selectedRole ? (
                                    <motion.div
                                        key="role-selection"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    >
                                        <RoleSelection onSelectRole={handleSelectRole} />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="login-form"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    >
                                        <LoginForm selectedRole={selectedRole} onBack={handleBack} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key="workspace-discovery"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                            >
                                <WorkspaceDiscovery />
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>

                {/* Footer */}
                <footer className="relative z-10 mt-auto pb-6 text-center text-muted-foreground text-sm">
                    &copy; {new Date().getFullYear()} PolyFlow ERP Systems
                </footer>
            </div>

            {/* Right Panel - Brand */}
            <BrandPanel subdomain={subdomain} />
        </main>
    );
}
