'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

export default function PublicNav() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <header className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? 'bg-zinc-950/90 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/20' : 'bg-transparent'}`}>
            <div className="container mx-auto px-6 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 group">
                    <PolyFlowLogo variant="dark" size="sm" />
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <Link href="#features" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-white hover:after:w-full after:transition-all after:duration-300">
                        Features
                    </Link>
                    <Link href="#testimonials" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-white hover:after:w-full after:transition-all after:duration-300">
                        About Us
                    </Link>
                    <Link href="/login" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors duration-300">
                        Tenant Login
                    </Link>
                    <Button className="bg-white text-zinc-950 hover:bg-zinc-200 text-sm h-9 px-6 rounded-full font-semibold shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all duration-300" asChild>
                        <Link href="#contact">Contact Sales</Link>
                    </Button>
                </nav>

                {/* Mobile hamburger */}
                <button
                    className="md:hidden text-white p-2"
                    onClick={() => setMobileOpen(!mobileOpen)}
                >
                    {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div className="md:hidden bg-zinc-950/95 backdrop-blur-xl border-t border-white/5 px-6 py-6 space-y-4 animate-in slide-in-from-top duration-300">
                    <Link href="#features" className="block text-zinc-300 hover:text-white transition-colors py-2" onClick={() => setMobileOpen(false)}>Features</Link>
                    <Link href="#testimonials" className="block text-zinc-300 hover:text-white transition-colors py-2" onClick={() => setMobileOpen(false)}>About Us</Link>
                    <Link href="/login" className="block text-zinc-300 hover:text-white transition-colors py-2" onClick={() => setMobileOpen(false)}>Tenant Login</Link>
                    <Button className="w-full bg-white text-zinc-950 hover:bg-zinc-200 rounded-full font-semibold" asChild>
                        <Link href="#contact" onClick={() => setMobileOpen(false)}>Contact Sales</Link>
                    </Button>
                </div>
            )}
        </header>
    );
}
