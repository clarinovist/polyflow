'use client';

import {
    Warehouse,
    Factory,
    TrendingUp,
    Receipt,
    BarChart3,
    Truck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { featureLabels as L } from '@/lib/labels/home';

const features = [
    {
        title: L.items.warehouse.title,
        description: L.items.warehouse.description,
        icon: Warehouse,
        gradient: 'from-amber-500/20 to-amber-500/5',
        iconColor: 'text-amber-400',
        borderColor: 'hover:border-amber-500/20',
        glowColor: 'group-hover:shadow-amber-500/10',
        bentoClass: '',
    },
    {
        title: L.items.production.title,
        description: L.items.production.description,
        icon: Factory,
        gradient: 'from-emerald-500/20 to-emerald-500/5',
        iconColor: 'text-emerald-400',
        borderColor: 'hover:border-emerald-500/20',
        glowColor: 'group-hover:shadow-emerald-500/10',
        // The anchor card — spans 2 columns + 2 rows on large screens
        bentoClass: 'lg:col-span-2 lg:row-span-2',
    },
    {
        title: L.items.sales.title,
        description: L.items.sales.description,
        icon: TrendingUp,
        gradient: 'from-rose-500/20 to-rose-500/5',
        iconColor: 'text-rose-400',
        borderColor: 'hover:border-rose-500/20',
        glowColor: 'group-hover:shadow-rose-500/10',
        bentoClass: '',
    },
    {
        title: L.items.finance.title,
        description: L.items.finance.description,
        icon: Receipt,
        gradient: 'from-cyan-500/20 to-cyan-500/5',
        iconColor: 'text-cyan-400',
        borderColor: 'hover:border-cyan-500/20',
        glowColor: 'group-hover:shadow-cyan-500/10',
        bentoClass: '',
    },
    {
        title: L.items.analytics.title,
        description: L.items.analytics.description,
        icon: BarChart3,
        gradient: 'from-purple-500/20 to-purple-500/5',
        iconColor: 'text-purple-400',
        borderColor: 'hover:border-purple-500/20',
        glowColor: 'group-hover:shadow-purple-500/10',
        bentoClass: '',
    },
    {
        title: L.items.logistics.title,
        description: L.items.logistics.description,
        icon: Truck,
        gradient: 'from-blue-500/20 to-blue-500/5',
        iconColor: 'text-blue-400',
        borderColor: 'hover:border-blue-500/20',
        glowColor: 'group-hover:shadow-blue-500/10',
        bentoClass: '',
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut' as const },
    },
};

export default function FeaturesSectionEnhanced() {
    const prefersReducedMotion = useReducedMotionSafe();
    const animated = !prefersReducedMotion;

    return (
        <section
            id="features"
            className="py-24 scroll-mt-24 relative overflow-hidden"
        >
            {/* Section background */}
            <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.1),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.1),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.06]" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-300/50 dark:via-white/10 to-transparent" />
            <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-emerald-500/[0.06] rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-6xl relative z-10">
                <motion.div
                    initial={false}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0 }}
                    transition={{ duration: animated ? 0.6 : 0.2 }}
                    className="text-center mb-14"
                >
                    <motion.span
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0 }}
                        transition={{ delay: animated ? 0.1 : 0, duration: 0.5 }}
                        className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4 block"
                    >
                        {L.sectionTitle}
                    </motion.span>
                    <motion.h2
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0 }}
                        transition={{ delay: animated ? 0.2 : 0, duration: 0.6 }}
                        className="text-3xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-5"
                    >
                        {L.sectionHeading}
                    </motion.h2>
                    <motion.p
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0 }}
                        transition={{ delay: animated ? 0.3 : 0, duration: 0.6 }}
                        className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto text-lg"
                    >
                        {L.sectionDescription}
                    </motion.p>
                </motion.div>

                {/* Bento Grid — production is the anchor (2x2) */}
                <motion.div
                    variants={containerVariants}
                    initial={false}
                    whileInView="visible"
                    viewport={{ once: true, amount: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-fr"
                >
                    {features.map((feature, index) => {
                        const isAnchor = feature.bentoClass.includes('col-span-2');
                        return (
                            <motion.div
                                key={index}
                                variants={itemVariants}
                                className={feature.bentoClass}
                            >
                                <div
                                    className={`group relative p-7 rounded-2xl border border-zinc-200 dark:border-white/5 bg-white dark:bg-zinc-900/20 ${feature.borderColor} ${feature.glowColor} hover:bg-zinc-100 dark:hover:bg-zinc-900/40 transition-all duration-500 cursor-default h-full shadow-lg hover:shadow-xl ${
                                        isAnchor
                                            ? 'flex flex-col justify-between min-h-[280px]'
                                            : ''
                                    }`}
                                >
                                    {/* Gradient glow on hover */}
                                    <div
                                        className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                                    />

                                    <div className="relative z-10">
                                        <motion.div
                                            whileHover={
                                                animated
                                                    ? { scale: 1.1, rotate: 5 }
                                                    : undefined
                                            }
                                            transition={{
                                                type: 'spring',
                                                stiffness: 300,
                                                damping: 20,
                                            }}
                                            className={`w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800 flex items-center justify-center mb-5 transition-colors duration-300 ${
                                                isAnchor ? 'lg:w-14 lg:h-14' : ''
                                            }`}
                                        >
                                            <feature.icon
                                                className={`h-5 w-5 ${feature.iconColor} ${
                                                    isAnchor ? 'lg:h-7 lg:w-7' : ''
                                                }`}
                                            />
                                        </motion.div>
                                        <h3
                                            className={`font-semibold text-zinc-900 dark:text-white mb-2 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors ${
                                                isAnchor
                                                    ? 'text-xl lg:text-2xl'
                                                    : 'text-lg'
                                            }`}
                                        >
                                            {feature.title}
                                        </h3>
                                        <p
                                            className={`text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 leading-relaxed transition-colors duration-300 ${
                                                isAnchor
                                                    ? 'text-sm lg:text-base'
                                                    : 'text-sm'
                                            }`}
                                        >
                                            {feature.description}
                                        </p>
                                    </div>

                                    {/* Anchor card decorative visual — mini production line */}
                                    {isAnchor && (
                                        <div className="relative z-10 mt-6 hidden lg:flex items-center gap-2">
                                            {['SO', 'Prod', 'WH', 'Inv'].map(
                                                (tag, i) => (
                                                    <div key={tag} className="flex items-center gap-2">
                                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium">
                                                            {tag}
                                                        </span>
                                                        {i < 3 && (
                                                            <span className="text-zinc-600 dark:text-zinc-700">
                                                                →
                                                            </span>
                                                        )}
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>
        </section>
    );
}
