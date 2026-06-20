'use client';

import { Warehouse, Factory, TrendingUp, Receipt, BarChart3, Truck } from 'lucide-react';
import { motion } from 'framer-motion';
import { featureLabels as L } from '@/lib/labels/home';

const features = [
    {
        title: L.items.warehouse.title,
        description: L.items.warehouse.description,
        icon: Warehouse,
        gradient: 'from-amber-500/20 to-amber-500/5',
        iconColor: 'text-amber-400',
        borderColor: 'hover:border-amber-500/20',
    },
    {
        title: L.items.production.title,
        description: L.items.production.description,
        icon: Factory,
        gradient: 'from-emerald-500/20 to-emerald-500/5',
        iconColor: 'text-emerald-400',
        borderColor: 'hover:border-emerald-500/20',
    },
    {
        title: L.items.sales.title,
        description: L.items.sales.description,
        icon: TrendingUp,
        gradient: 'from-rose-500/20 to-rose-500/5',
        iconColor: 'text-rose-400',
        borderColor: 'hover:border-rose-500/20',
    },
    {
        title: L.items.finance.title,
        description: L.items.finance.description,
        icon: Receipt,
        gradient: 'from-cyan-500/20 to-cyan-500/5',
        iconColor: 'text-cyan-400',
        borderColor: 'hover:border-cyan-500/20',
    },
    {
        title: L.items.analytics.title,
        description: L.items.analytics.description,
        icon: BarChart3,
        gradient: 'from-purple-500/20 to-purple-500/5',
        iconColor: 'text-purple-400',
        borderColor: 'hover:border-purple-500/20',
    },
    {
        title: L.items.logistics.title,
        description: L.items.logistics.description,
        icon: Truck,
        gradient: 'from-blue-500/20 to-blue-500/5',
        iconColor: 'text-blue-400',
        borderColor: 'hover:border-blue-500/20',
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } }
};

export default function FeaturesSection() {
    return (
        <section id="features" className="py-28 relative overflow-hidden">
            {/* Section background */}
            <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.1),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.1),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.06]" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-300/50 dark:via-white/10 to-transparent" />
            <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-emerald-500/[0.06] rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-6xl relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4 block">{L.sectionTitle}</span>
                    <h2 className="text-3xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-5">{L.sectionHeading}</h2>
                    <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto text-lg">
                        {L.sectionDescription}
                    </p>
                </motion.div>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-50px' }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                >
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className={`group relative p-7 rounded-2xl border border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900/20 ${feature.borderColor} hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-all duration-500 cursor-default`}
                        >
                            {/* Gradient glow on hover */}
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                            <div className="relative z-10">
                                <div className={`w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 flex items-center justify-center mb-5 transition-colors duration-300`}>
                                    <feature.icon className={`h-5 w-5 ${feature.iconColor}`} />
                                </div>
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{feature.title}</h3>
                                <p className="text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 leading-relaxed text-sm transition-colors duration-300">
                                    {feature.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
