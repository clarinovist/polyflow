'use client';

import Link from 'next/link';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import { footerLabels as L } from '@/lib/labels/home';

export default function PublicFooter() {
    return (
        <footer className="relative bg-zinc-950 pt-20 pb-10">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="container mx-auto px-6 max-w-6xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    <div className="col-span-1 md:col-span-2">
                        <Link href="/" className="inline-block mb-5">
                            <PolyFlowLogo variant="dark" size="sm" />
                        </Link>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm leading-relaxed">
                            {L.description}
                        </p>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-5 text-sm uppercase tracking-wider">{L.product}</h4>
                        <ul className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
                            <li><Link href="#features" className="hover:text-white transition-colors duration-300">{L.features}</Link></li>
                            <li><Link href="#testimonials" className="hover:text-white transition-colors duration-300">{L.testimonials}</Link></li>
                            <li><Link href="#contact" className="hover:text-white transition-colors duration-300">{L.contactSales}</Link></li>
                            <li><Link href="/register" className="hover:text-white transition-colors duration-300">{L.register}</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-5 text-sm uppercase tracking-wider">{L.company}</h4>
                        <ul className="space-y-3 text-sm text-zinc-500 dark:text-zinc-400">
                            <li><Link href="/login" className="hover:text-white transition-colors duration-300">{L.tenantLogin}</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors duration-300">{L.termsOfService}</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors duration-300">{L.privacyPolicy}</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-white/5 dark:border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 gap-4">
                    <p>{L.copyright.replace('{year}', String(new Date().getFullYear()))}</p>
                    <p className="text-zinc-700 dark:text-zinc-300">{L.craftedFor}</p>
                </div>
            </div>
        </footer>
    );
}
