'use client';

import { motion } from 'framer-motion';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { whyPolyflow as L } from '@/lib/labels/home';
import { Building2, Workflow, ShieldCheck, Accessibility } from 'lucide-react';

const reasons = [
    {
        title: L.items.multiTenant.title,
        description: L.items.multiTenant.description,
        icon: Building2,
        gradient: 'from-blue-500/20 to-blue-500/5',
        iconColor: 'text-blue-400',
        borderColor: 'hover:border-blue-500/20',
    },
    {
        title: L.items.soFirst.title,
        description: L.items.soFirst.description,
        icon: Workflow,
        gradient: 'from-emerald-500/20 to-emerald-500/5',
        iconColor: 'text-emerald-400',
        borderColor: 'hover:border-emerald-500/20',
    },
    {
        title: L.items.auditTrail.title,
        description: L.items.auditTrail.description,
        icon: ShieldCheck,
        gradient: 'from-purple-500/20 to-purple-500/5',
        iconColor: 'text-purple-400',
        borderColor: 'hover:border-purple-500/20',
    },
    {
        title: L.items.accessibility.title,
        description: L.items.accessibility.description,
        icon: Accessibility,
        gradient: 'from-amber-500/20 to-amber-500/5',
        iconColor: 'text-amber-400',
        borderColor: 'hover:border-amber-500/20',
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12 },
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

export default function TestimonialSectionEnhanced() {
    const prefersReducedMotion = useReducedMotionSafe();
    const animated = !prefersReducedMotion;

    return (
        <section
            id="testimonials"
            className="py-24 scroll-mt-24 relative overflow-hidden"
        >
            {/* Background */}
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,119,198,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.06]" />

            {/* Static glow orbs — no animation under reduced motion */}
            <motion.div
                className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"
                animate={
                    animated
                        ? { scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }
                        : undefined
                }
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"
                animate={
                    animated
                        ? { scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }
                        : undefined
                }
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 2,
                }}
            />

            <div className="container mx-auto px-6 max-w-5xl relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: animated ? 20 : 0 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0 }}
                    transition={{ duration: animated ? 0.6 : 0.2 }}
                    className="text-center mb-16"
                >
                    <motion.span
                        initial={{ opacity: 0, y: animated ? 10 : 0 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: animated ? 0.1 : 0, duration: 0.5 }}
                        className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4 block"
                    >
                        {L.sectionTitle}
                    </motion.span>
                    <motion.h2
                        initial={{ opacity: 0, y: animated ? 20 : 0 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: animated ? 0.2 : 0, duration: 0.6 }}
                        className="text-3xl md:text-5xl font-bold text-white mb-5"
                    >
                        {L.sectionHeading}
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: animated ? 20 : 0 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: animated ? 0.3 : 0, duration: 0.6 }}
                        className="text-zinc-400 max-w-2xl mx-auto text-lg"
                    >
                        {L.sectionDescription}
                    </motion.p>
                </motion.div>

                {/* Reason cards */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-5"
                >
                    {reasons.map((reason, index) => (
                        <motion.div key={index} variants={itemVariants}>
                            <div
                                className={`group relative p-7 rounded-2xl border border-white/5 bg-zinc-900/20 ${reason.borderColor} hover:bg-zinc-900/40 transition-all duration-500 cursor-default h-full shadow-lg hover:shadow-xl overflow-hidden`}
                            >
                                {/* Gradient glow */}
                                <div
                                    className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${reason.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                                />

                                <div className="relative z-10 flex items-start gap-5">
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
                                        className="w-12 h-12 shrink-0 rounded-xl bg-zinc-800/80 group-hover:bg-zinc-800 flex items-center justify-center transition-colors duration-300"
                                    >
                                        <reason.icon
                                            className={`h-6 w-6 ${reason.iconColor}`}
                                        />
                                    </motion.div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white mb-2">
                                            {reason.title}
                                        </h3>
                                        <p className="text-zinc-400 leading-relaxed text-sm">
                                            {reason.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
