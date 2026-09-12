'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import {
    heroLabels as L,
    homeLinks,
    heroStats,
    heroPipeline,
} from '@/lib/labels/home';
import { useMemo } from 'react';

// Animated gradient text component
function AnimatedGradientText({
    children,
    className,
    animated = true,
}: {
    children: React.ReactNode;
    className?: string;
    animated?: boolean;
}) {
    return (
        <span
            className={`bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent ${
                animated ? 'bg-[length:200%_auto] animate-gradient' : ''
            } ${className ?? ''}`}
        >
            {children}
        </span>
    );
}

// Pipeline node connected by a vertical line — the "product story" visual
function PipelinePanel({ animated }: { animated: boolean }) {
    const { title, steps } = heroPipeline;
    return (
        <div className="relative w-full rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-sm p-6 md:p-7 overflow-hidden">
            {/* Glow behind panel */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-purple-500/10 rounded-full blur-[70px] pointer-events-none" />

            <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-5">
                    {title}
                </p>
                <div className="relative">
                    {/* Vertical connecting line */}
                    <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-blue-500/40 via-purple-500/30 to-transparent" />
                    <div className="space-y-3">
                        {steps.map((step, i) => (
                            <motion.div
                                key={step.num}
                                initial={false}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    delay: animated ? 0.6 + i * 0.15 : 0,
                                    duration: 0.4,
                                }}
                                className="relative flex items-center gap-4"
                            >
                                {/* Node circle */}
                                <div className="relative z-10 flex w-10 h-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-xs font-bold text-blue-400">
                                    {step.num}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">
                                        {step.label}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {step.desc}
                                    </p>
                                </div>
                                {/* Flow chip between nodes */}
                                {i < steps.length - 1 && (
                                    <motion.div
                                        className="ml-auto hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/5"
                                        animate={
                                            animated
                                                ? {
                                                      y: [0, -3, 0],
                                                      opacity: [0.5, 1, 0.5],
                                                  }
                                                : undefined
                                        }
                                        transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            delay: i * 0.5,
                                        }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        <span className="text-[10px] text-zinc-400">
                                            sync
                                        </span>
                                    </motion.div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HeroSectionEnhanced() {
    const prefersReducedMotion = useReducedMotionSafe();

    // Static decorative dots — no animated particles (heavy GPU), just a subtle grid
    const dots = useMemo(() => {
        if (prefersReducedMotion) return [];
        const seed = 42;
        return Array.from({ length: 8 }, (_, i) => {
            const s = (seed * (i + 1)) % 100;
            return {
                id: i,
                x: s,
                y: (s * 7) % 100,
                size: ((s * 3) % 3) + 2,
                delay: i * 0.4,
            };
        });
    }, [prefersReducedMotion]);

    const entry = (delay: number) => ({
        initial: false as const,
        animate: { opacity: 1, y: 0 },
        transition: {
            delay: prefersReducedMotion ? 0 : delay,
            duration: prefersReducedMotion ? 0.2 : 0.6,
        },
    });

    return (
        <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden flex flex-col items-center justify-center text-center px-6">
            {/* Multi-layer background */}
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent" />

            {/* Floating orbs — static under reduced motion */}
            <motion.div
                className="absolute top-20 left-1/4 w-80 h-80 bg-blue-500/15 rounded-full blur-[100px] pointer-events-none"
                animate={
                    prefersReducedMotion
                        ? undefined
                        : { scale: [1, 1.1, 1], opacity: [0.15, 0.2, 0.15] }
                }
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute bottom-20 right-1/4 w-[28rem] h-[28rem] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"
                animate={
                    prefersReducedMotion
                        ? undefined
                        : { scale: [1, 1.15, 1], opacity: [0.1, 0.15, 0.1] }
                }
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 2,
                }}
            />

            {/* Floating dots (lightweight, fewer than before) */}
            {dots.map((d) => (
                <motion.div
                    key={d.id}
                    className="absolute rounded-full bg-white/10"
                    style={{ width: d.size, height: d.size, left: `${d.x}%`, top: `${d.y}%` }}
                    animate={prefersReducedMotion ? undefined : { y: [0, -20, 0], opacity: [0.15, 0.4, 0.15] }}
                    transition={{ duration: 5, repeat: Infinity, delay: d.delay, ease: 'easeInOut' }}
                />
            ))}

            <div className="relative z-10 max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                {/* LEFT — text block */}
                <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                    {/* Badge */}
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6 relative overflow-hidden"
                    >
                        {!prefersReducedMotion && (
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                animate={{ x: [-200, 200] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            />
                        )}
                        <Sparkles className="w-4 h-4 text-blue-400 relative z-10" />
                        <span className="text-sm font-medium text-zinc-300 relative z-10">
                            {L.badge}
                        </span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        {...entry(0.3)}
                        className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-5 leading-[1.08]"
                    >
                        {L.headline}{' '}
                        <AnimatedGradientText animated={!prefersReducedMotion}>
                            {L.headlineAccent}
                        </AnimatedGradientText>{' '}
                        {L.headlineEnd}
                    </motion.h1>

                    {/* Tagline */}
                    <motion.p
                        {...entry(0.4)}
                        className="text-base md:text-lg text-zinc-400 max-w-xl mb-8 leading-relaxed"
                    >
                        {L.tagline}
                    </motion.p>

                    {/* CTA Buttons */}
                    <motion.div
                        {...entry(0.5)}
                        className="flex flex-col sm:flex-row items-center gap-4 mb-8"
                    >
                        <Button
                            className="h-14 px-10 bg-white hover:bg-zinc-100 text-zinc-950 text-base font-semibold rounded-full transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-105"
                            asChild
                        >
                            <a href={homeLinks.contactSales}>
                                {L.contactSales}{' '}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            className="h-14 px-8 text-zinc-400 hover:text-white text-base font-medium rounded-full hover:bg-white/5 transition-all duration-300"
                            asChild
                        >
                            <a href={homeLinks.exploreFeatures}>
                                {L.exploreFeatures}
                            </a>
                        </Button>
                    </motion.div>

                    {/* Stats strip */}
                    <motion.div
                        {...entry(0.6)}
                        className="flex items-center gap-6 lg:gap-8"
                    >
                        {heroStats.map((stat, i) => (
                            <div key={stat.label} className="flex items-center gap-6 lg:gap-8">
                                {i > 0 && (
                                    <div className="h-8 w-px bg-white/10" />
                                )}
                                <div>
                                    <p className="text-2xl font-bold text-white">
                                        {stat.value}
                                    </p>
                                    <p className="text-xs text-zinc-500 whitespace-nowrap">
                                        {stat.label}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* RIGHT — pipeline panel (the "product story") */}
                <motion.div
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0.2 : 0.8, delay: 0.4 }}
                    className="w-full max-w-md mx-auto lg:max-w-none"
                >
                    <PipelinePanel animated={!prefersReducedMotion} />
                </motion.div>
            </div>
        </section>
    );
}
