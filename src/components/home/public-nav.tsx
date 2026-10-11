'use client';

import Link from 'next/link';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { Button } from '@/components/ui/button';
import { usePublicNavState } from '@/hooks/use-public-nav-state';
import { Menu, X } from 'lucide-react';
import { homeLinks, navLabels as L } from '@/lib/labels/home';

const links = [
    { href: `/${homeLinks.exploreWorkflow}`, label: L.workflow },
    { href: `/${homeLinks.whyPolyflow}`, label: L.whyPolyflow },
    { href: homeLinks.login, label: L.tenantLogin },
];

export default function PublicNav() {
    const { scrolled, mobileOpen, setMobileOpen, mobileMenuButton } =
        usePublicNavState();

    return (
        <header
            className={`fixed top-0 z-50 w-full transition-all duration-500 ${scrolled ? 'border-b border-zinc-200 bg-white/80 shadow-lg shadow-black/20 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-950/90' : 'bg-transparent'}`}
        >
            <div className="container mx-auto flex h-20 items-center justify-between px-6">
                <Link
                    href="/"
                    className="group flex min-h-11 items-center gap-2"
                >
                    <PolyFlowLogo variant="dark" size="sm" />
                </Link>

                <nav className="hidden items-center gap-8 md:flex">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="relative text-sm font-medium text-zinc-600 transition-colors duration-300 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:bg-zinc-900 after:transition-all after:duration-300 hover:text-zinc-900 hover:after:w-full dark:text-zinc-400 dark:after:bg-white dark:hover:text-white"
                        >
                            {link.label}
                        </Link>
                    ))}
                    <Button
                        className="h-9 rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300 hover:bg-zinc-800 hover:shadow-[0_0_25px_rgba(255,255,255,0.15)] dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        asChild
                    >
                        <Link href={homeLinks.contactSales}>
                            {L.contactSales}
                        </Link>
                    </Button>
                </nav>

                <button
                    ref={mobileMenuButton}
                    type="button"
                    aria-label={mobileOpen ? L.closeMenu : L.openMenu}
                    aria-expanded={mobileOpen}
                    aria-controls="register-mobile-menu"
                    className="flex min-h-11 min-w-11 items-center justify-center p-2 text-zinc-900 dark:text-white md:hidden"
                    onClick={() => setMobileOpen(!mobileOpen)}
                >
                    {mobileOpen ? (
                        <X className="h-6 w-6" />
                    ) : (
                        <Menu className="h-6 w-6" />
                    )}
                </button>
            </div>

            {mobileOpen && (
                <div
                    id="register-mobile-menu"
                    className="animate-in space-y-4 border-t border-zinc-200 bg-white px-6 py-6 backdrop-blur-xl duration-300 slide-in-from-top dark:border-white/5 dark:bg-zinc-950/95 md:hidden"
                >
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="flex min-h-11 items-center py-2 text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                            onClick={() => setMobileOpen(false)}
                        >
                            {link.label}
                        </Link>
                    ))}
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
                </div>
            )}
        </header>
    );
}
