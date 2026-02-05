'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/auth/login-form';
import BrandPanel from '@/components/auth/brand-panel';
import RoleSelection, { RoleType } from '@/components/auth/role-selection';
import { AnimatePresence, motion } from 'framer-motion';

export default function LoginPage() {
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



                <div className="relative z-10 w-full">
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
                </div>

                {/* Footer */}
                <footer className="relative z-10 mt-auto pb-6 text-center text-muted-foreground text-sm">
                    &copy; {new Date().getFullYear()} PolyFlow ERP Systems
                </footer>
            </div>

            {/* Right Panel - Brand */}
            < BrandPanel />
        </main >
    );
}
