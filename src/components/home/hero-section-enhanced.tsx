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
        <div className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 p-4 backdrop-blur-sm sm:p-6 md:p-7">
            {/* Glow behind panel */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-purple-500/10 rounded-full blur-[70px] pointer-events-none" />

            <div className="relative z-10">
                <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-400">
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
                                className="relative flex min-w-0 items-center gap-3 sm:gap-4"
                            >
                                {/* Node circle */}
                                <div className="relative z-10 flex w-10 h-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-xs font-bold text-blue-400">
                                    {step.num}
                                </div>
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-semibold text-white">
                                        {step.label}
                                    </p>
                                    <p className="break-words text-xs text-zinc-400">
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
                                        <span className="text-[10px] text-zinc-300">
                                            Terhubung
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
        <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 pt-28 pb-16 text-center sm:px-6 lg:pt-36 lg:pb-24">
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

            <div className="relative z-10 mx-auto grid w-full min-w-0 max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
                {/* LEFT — text block */}
                <div className="flex w-full min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
                    {/* Badge */}
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="relative mb-6 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm"
                    >
                        {!prefersReducedMotion && (
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                animate={{ x: [-200, 200] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            />
                        )}
                        <Sparkles className="relative z-10 h-4 w-4 shrink-0 text-blue-400" />
                        <span className="relative z-10 min-w-0 break-words text-sm font-medium text-zinc-300">
                            {L.badge}
                        </span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        {...entry(0.3)}
                        className="mb-5 w-full max-w-full break-words text-4xl leading-[1.08] font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
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
                        className="mb-8 w-full max-w-xl break-words text-base leading-relaxed text-zinc-300 md:text-lg"
                    >
                        {L.tagline}
                    </motion.p>

                    {/* CTA Buttons */}
                    <motion.div
                        {...entry(0.5)}
                        className="mb-8 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row"
                    >
                        <Button
                            className="h-14 w-full max-w-full rounded-full bg-white px-6 text-base font-semibold text-zinc-950 shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-all duration-300 hover:scale-105 hover:bg-zinc-100 hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] sm:w-auto sm:px-10"
                            asChild
                        >
                            <a href={homeLinks.contactSales}>
                                {L.contactSales}{' '}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            className="h-14 w-full max-w-full rounded-full px-6 text-base font-medium text-zinc-400 transition-all duration-300 hover:bg-white/5 hover:text-white sm:w-auto sm:px-8"
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
                        className="grid w-full min-w-0 grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-6 lg:gap-8"
                    >
                        {heroStats.map((stat, i) => (
                            <div
                                key={stat.label}
                                className="flex min-w-0 items-center justify-center gap-2 sm:justify-start sm:gap-6 lg:gap-8"
                            >
                                {i > 0 && (
                                    <div className="hidden h-8 w-px shrink-0 bg-white/10 sm:block" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-2xl font-bold text-white">
                                        {stat.value}
                                    </p>
                                    <p className="break-words text-xs leading-tight text-zinc-400">
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
                    className="mx-auto w-full min-w-0 max-w-md lg:max-w-none"
                >
                    <PipelinePanel animated={!prefersReducedMotion} />
                </motion.div>
            </div>
        </section>
    );
}
