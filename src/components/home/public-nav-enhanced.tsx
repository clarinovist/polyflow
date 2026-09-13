'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { navLabels as L, homeLinks } from '@/lib/labels/home';

export default function PublicNavEnhanced() {
    const prefersReducedMotion = useReducedMotionSafe();
    const animated = !prefersReducedMotion;
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const mobileMenuButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!mobileOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setMobileOpen(false);
            mobileMenuButton.current?.focus();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [mobileOpen]);

    const navLinks = [
        { href: homeLinks.exploreFeatures, label: L.features },
        { href: homeLinks.testimonials, label: L.testimonials },
        { href: homeLinks.login, label: L.tenantLogin },
    ];

    return (
        <motion.header
            initial={false}
            animate={{ y: 0 }}
            transition={{
                duration: animated ? 0.6 : 0.2,
                ease: [0.16, 1, 0.3, 1],
            }}
            className={`fixed top-0 w-full z-50 transition-all duration-500 ${
                scrolled
                    ? 'bg-white/80 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 shadow-lg shadow-black/20'
                    : 'bg-transparent'
            }`}
        >
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                    <Link
                        href="/"
                        className="group flex min-h-11 items-center gap-2"
                    >
                        <PolyFlowLogo variant="dark" size="sm" />
                    </Link>
                </motion.div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map((link, index) => (
                        <motion.div
                            key={link.href}
                            initial={false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                delay: animated ? 0.1 + index * 0.1 : 0,
                                duration: 0.5,
                            }}
                        >
                            <Link
                                href={link.href}
                                className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-zinc-900 dark:after:bg-white hover:after:w-full after:transition-all after:duration-300"
                            >
                                {link.label}
                            </Link>
                        </motion.div>
                    ))}
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                            delay: animated ? 0.4 : 0,
                            duration: 0.5,
                        }}
                    >
                        <motion.div
                            whileHover={animated ? { scale: 1.05 } : undefined}
                            whileTap={animated ? { scale: 0.95 } : undefined}
                            transition={{
                                type: 'spring',
                                stiffness: 400,
                                damping: 17,
                            }}
                        >
                            <Button
                                className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 text-sm h-9 px-6 rounded-full font-semibold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all duration-300"
                                asChild
                            >
                                <Link href={homeLinks.contactSales}>
                                    {L.contactSales}
                                </Link>
                            </Button>
                        </motion.div>
                    </motion.div>
                </nav>

                {/* Mobile hamburger */}
                <motion.button
                    ref={mobileMenuButton}
                    type="button"
                    aria-label={mobileOpen ? L.closeMenu : L.openMenu}
                    aria-expanded={mobileOpen}
                    aria-controls="public-mobile-menu"
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: animated ? 0.5 : 0, duration: 0.5 }}
                    className="flex min-h-11 min-w-11 items-center justify-center p-2 text-zinc-900 dark:text-white md:hidden"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    whileTap={animated ? { scale: 0.9 } : undefined}
                >
                    <AnimatePresence mode="wait">
                        {mobileOpen ? (
                            <motion.div
                                key="close"
                                initial={{
                                    rotate: animated ? -90 : 0,
                                    opacity: 0,
                                }}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: animated ? 90 : 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <X className="w-6 h-6" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="menu"
                                initial={false}
                                animate={{ rotate: 0, opacity: 1 }}
                                exit={{
                                    rotate: animated ? -90 : 0,
                                    opacity: 0,
                                }}
                                transition={{ duration: 0.2 }}
                            >
                                <Menu className="w-6 h-6" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.button>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        id="public-mobile-menu"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="md:hidden bg-white dark:bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-200 dark:border-white/5 overflow-hidden"
                    >
                        <div className="px-6 py-6 space-y-4">
                            {navLinks.map((link, index) => (
                                <motion.div
                                    key={link.href}
                                    initial={{
                                        opacity: 0,
                                        x: animated ? -20 : 0,
                                    }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                        delay: animated ? index * 0.1 : 0,
                                        duration: 0.3,
                                    }}
                                >
                                    <Link
                                        href={link.href}
                                        className="flex min-h-11 items-center py-2 text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        {link.label}
                                    </Link>
                                </motion.div>
                            ))}
                            <motion.div
                                initial={{ opacity: 0, x: animated ? -20 : 0 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    delay: animated ? 0.3 : 0,
                                    duration: 0.3,
                                }}
                            >
                                <Button
                                    className="min-h-11 w-full rounded-full bg-zinc-900 font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                                    asChild
                                >
                                    <Link
                                        href={homeLinks.contactSales}
                                        onClick={() => setMobileOpen(false)}
                                    >
                                        {L.contactSales}
                                    </Link>
                                </Button>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
}
