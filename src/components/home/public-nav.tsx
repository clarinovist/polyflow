'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

export default function PublicNav() {
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

    return (
        <header
            className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? 'bg-white/80 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 shadow-lg shadow-black/20' : 'bg-transparent'}`}
        >
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link
                    href="/"
                    className="group flex min-h-11 items-center gap-2"
                >
                    <PolyFlowLogo variant="dark" size="sm" />
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <Link
                        href="#features"
                        className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-zinc-900 dark:after:bg-white hover:after:w-full after:transition-all after:duration-300"
                    >
                        Fitur
                    </Link>
                    <Link
                        href="#testimonials"
                        className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-zinc-900 dark:after:bg-white hover:after:w-full after:transition-all after:duration-300"
                    >
                        Kenapa PolyFlow
                    </Link>
                    <Link
                        href="/login"
                        className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors duration-300"
                    >
                        Login Tenant
                    </Link>
                    <Button
                        className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 text-sm h-9 px-6 rounded-full font-semibold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all duration-300"
                        asChild
                    >
                        <Link href="#contact">Hubungi Penjualan</Link>
                    </Button>
                </nav>

                {/* Mobile hamburger */}
                <button
                    ref={mobileMenuButton}
                    type="button"
                    aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
                    aria-expanded={mobileOpen}
                    aria-controls="register-mobile-menu"
                    className="flex min-h-11 min-w-11 items-center justify-center p-2 text-zinc-900 dark:text-white md:hidden"
                    onClick={() => setMobileOpen(!mobileOpen)}
                >
                    {mobileOpen ? (
                        <X className="w-6 h-6" />
                    ) : (
                        <Menu className="w-6 h-6" />
                    )}
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div
                    id="register-mobile-menu"
                    className="animate-in space-y-4 border-t border-zinc-200 bg-white px-6 py-6 backdrop-blur-xl duration-300 slide-in-from-top dark:border-white/5 dark:bg-zinc-950/95 md:hidden"
                >
                    <Link
                        href="#features"
                        className="flex min-h-11 items-center py-2 text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                        onClick={() => setMobileOpen(false)}
                    >
                        Fitur
                    </Link>
                    <Link
                        href="#testimonials"
                        className="flex min-h-11 items-center py-2 text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                        onClick={() => setMobileOpen(false)}
                    >
                        Kenapa PolyFlow
                    </Link>
                    <Link
                        href="/login"
                        className="flex min-h-11 items-center py-2 text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                        onClick={() => setMobileOpen(false)}
                    >
                        Login Tenant
                    </Link>
                    <Button
                        className="min-h-11 w-full rounded-full bg-zinc-900 font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        asChild
                    >
                        <Link
                            href="#contact"
                            onClick={() => setMobileOpen(false)}
                        >
                            Hubungi Penjualan
                        </Link>
                    </Button>
                </div>
            )}
        </header>
    );
}
