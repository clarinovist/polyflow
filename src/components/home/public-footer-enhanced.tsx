'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { footerLabels as L, homeLinks } from '@/lib/labels/home';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

const footerLinks = {
    product: [
        { label: L.features, href: homeLinks.exploreWorkflow },
        { label: L.testimonials, href: homeLinks.whyPolyflow },
        { label: L.contactSales, href: homeLinks.contactSales },
    ],
    company: [
        { label: L.register, href: homeLinks.register },
        { label: L.tenantLogin, href: homeLinks.login },
        { label: L.termsOfService, href: '/terms' },
        { label: L.privacyPolicy, href: '/privacy' },
    ],
};

export default function PublicFooterEnhanced() {
    return (
        <footer className="relative border-t border-white/5 bg-zinc-950">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.05),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03]" />

            <div className="container relative z-10 mx-auto max-w-6xl px-6">
                <div className="grid grid-cols-1 gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
                    <motion.div
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="lg:col-span-2"
                    >
                        <h3 className="mb-4 text-xl font-bold text-white">
                            PolyFlow ERP
                        </h3>
                        <p className="mb-6 max-w-md leading-relaxed text-zinc-400">
                            {L.description}
                        </p>
                        <Button
                            className="min-h-11 rounded-full bg-white px-6 font-semibold text-zinc-950 hover:bg-zinc-100"
                            asChild
                        >
                            <a href={homeLinks.contactSales}>
                                <Mail
                                    aria-hidden="true"
                                    className="mr-2 h-4 w-4"
                                />
                                {L.contactSales}
                                <ArrowRight
                                    aria-hidden="true"
                                    className="ml-2 h-4 w-4"
                                />
                            </a>
                        </Button>
                    </motion.div>

                    <motion.div
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1, duration: 0.6 }}
                    >
                        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
                            {L.product}
                        </h4>
                        <ul className="space-y-3">
                            {footerLinks.product.map((link) => (
                                <li key={link.label}>
                                    <motion.div
                                        whileHover={{ x: 4 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 400,
                                            damping: 17,
                                        }}
                                    >
                                        <Link
                                            href={link.href}
                                            className="text-sm text-zinc-400 transition-colors hover:text-white"
                                        >
                                            {link.label}
                                        </Link>
                                    </motion.div>
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    <motion.div
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">
                            {L.company}
                        </h4>
                        <ul className="space-y-3">
                            {footerLinks.company.map((link) => (
                                <li key={link.label}>
                                    <motion.div
                                        whileHover={{ x: 4 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 400,
                                            damping: 17,
                                        }}
                                    >
                                        <Link
                                            href={link.href}
                                            className="text-sm text-zinc-400 transition-colors hover:text-white"
                                        >
                                            {link.label}
                                        </Link>
                                    </motion.div>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                </div>

                <motion.div
                    initial={false}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="flex flex-col items-center justify-between gap-4 border-t border-white/5 py-6 md:flex-row"
                >
                    <p className="text-sm text-zinc-500">
                        © {new Date().getFullYear()} PolyFlow ERP Systems. Hak
                        cipta dilindungi.
                    </p>
                    <p className="text-xs text-zinc-600">{L.craftedFor}</p>
                </motion.div>
            </div>
        </footer>
    );
}
