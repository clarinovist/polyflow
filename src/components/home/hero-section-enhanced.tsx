'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useReducedMotionSafe } from '@/hooks/use-reduced-motion-safe';
import { heroLabels as L, homeLinks } from '@/lib/labels/home';
import { useRef, useMemo } from 'react';

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

// Floating particle component
function FloatingParticle({
    delay,
    x,
    y,
    size,
}: {
    delay: number;
    x: number;
    y: number;
    size: number;
}) {
    return (
        <motion.div
            className="absolute rounded-full bg-white/10"
            style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
            animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
                duration: 4,
                repeat: Infinity,
                delay,
                ease: 'easeInOut',
            }}
        />
    );
}

// Magnetic button wrapper — disabled entirely when the user asks for reduced motion,
// otherwise every pointer move drives a spring animation.
function MagneticButton({
    children,
    className,
    disabled = false,
}: {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useTransform(y, [-100, 100], [5, -5]);
    const rotateY = useTransform(x, [-100, 100], [-5, 5]);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (disabled || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        x.set(e.clientX - centerX);
        y.set(e.clientY - centerY);
    };

    const handleMouseLeave = () => {
        if (disabled) return;
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
        animate(y, 0, { type: 'spring', stiffness: 300, damping: 20 });
    };

    if (disabled) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            ref={ref}
            style={{ rotateX, rotateY, perspective: 1000 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// Seeded random number generator for consistent particles
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Avatar gradients are written as complete, literal class strings.
 * Tailwind scans source statically — building them with template interpolation
 * (`from-${color}-400`) means the classes are never emitted and the avatars
 * silently render transparent.
 */
const trustAvatars = [
    { initials: 'JD', gradient: 'from-blue-400 to-blue-600' },
    { initials: 'AK', gradient: 'from-purple-400 to-purple-600' },
    { initials: 'MR', gradient: 'from-orange-400 to-orange-600' },
    { initials: '+1K', gradient: 'from-emerald-400 to-emerald-600' },
] as const;

export default function HeroSectionEnhanced() {
    const prefersReducedMotion = useReducedMotionSafe();

    // Generate particles with seeded random for consistent server/client render.
    // Skipped entirely under reduced motion — 20 fewer animated nodes, not just paused ones.
    const particles = useMemo(() => {
        if (prefersReducedMotion) return [];
        const random = seededRandom(42);
        return Array.from({ length: 20 }, (_, i) => ({
            id: i,
            delay: i * 0.2,
            x: random() * 100,
            y: random() * 100,
            size: random() * 4 + 2,
        }));
    }, [prefersReducedMotion]);

    const entry = (delay: number) =>
        prefersReducedMotion
            ? {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: { duration: 0.2 },
              }
            : {
                  initial: { opacity: 0, y: 20 },
                  animate: { opacity: 1, y: 0 },
                  transition: { delay, duration: 0.6 },
              };

    return (
        <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden flex flex-col items-center justify-center text-center px-6">
            {/* Multi-layer background */}
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent" />

            {/* Floating orbs — static under reduced motion (large animated blurs are GPU-expensive) */}
            <motion.div
                className="absolute top-20 left-1/4 w-80 h-80 bg-blue-500/15 rounded-full blur-[100px] pointer-events-none"
                animate={
                    prefersReducedMotion
                        ? undefined
                        : { scale: [1, 1.1, 1], opacity: [0.15, 0.2, 0.15] }
                }
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
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
            <motion.div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-indigo-500/[0.07] rounded-full blur-[150px] pointer-events-none"
                animate={
                    prefersReducedMotion ? undefined : { scale: [1, 1.05, 1] }
                }
                transition={{
                    duration: 12,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
            />

            {/* Floating particles */}
            {particles.map((particle) => (
                <FloatingParticle
                    key={particle.id}
                    delay={particle.delay}
                    x={particle.x}
                    y={particle.y}
                    size={particle.size}
                />
            ))}

            {/* Decorative 3D P logo background */}
            <div
                aria-hidden="true"
                className="absolute -top-10 -right-20 pointer-events-none opacity-[0.08]"
            >
                <motion.div
                    className="relative w-[500px] h-[500px]"
                    animate={
                        prefersReducedMotion
                            ? undefined
                            : { rotateY: [0, 5, 0] }
                    }
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                >
                    <div className="absolute inset-0 transform translate-x-6 translate-y-6">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#4a4a4a"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                    <div className="absolute inset-0 transform translate-x-3 translate-y-3">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#555555"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                    <div className="absolute inset-0">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#666666"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: prefersReducedMotion ? 0.2 : 0.8,
                    ease: [0.16, 1, 0.3, 1],
                }}
                className="relative z-10 max-w-5xl mx-auto flex flex-col items-center"
            >
                {/* Badge with shimmer */}
                <motion.div
                    initial={{
                        opacity: 0,
                        scale: prefersReducedMotion ? 1 : 0.9,
                    }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6 relative overflow-hidden"
                >
                    {!prefersReducedMotion && (
                        <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                            animate={{ x: [-200, 200] }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: 'linear',
                            }}
                        />
                    )}
                    <Sparkles className="w-4 h-4 text-blue-400 relative z-10" />
                    <span className="text-sm font-medium text-zinc-300 dark:text-zinc-200 relative z-10">
                        {L.badge}
                    </span>
                </motion.div>

                {/* Animated headline */}
                <motion.h1
                    {...entry(0.3)}
                    className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-5 leading-[1.05]"
                >
                    {L.headline}{' '}
                    <AnimatedGradientText animated={!prefersReducedMotion}>
                        {L.headlineAccent}
                    </AnimatedGradientText>{' '}
                    {L.headlineEnd}
                </motion.h1>

                <motion.p
                    {...entry(0.4)}
                    className="text-base md:text-lg text-zinc-400 dark:text-zinc-300 max-w-2xl mb-8 leading-relaxed"
                >
                    {L.tagline}
                </motion.p>

                {/* CTA Buttons with magnetic effect */}
                <motion.div
                    {...entry(0.5)}
                    className="flex flex-col sm:flex-row items-center gap-4 mb-10"
                >
                    <MagneticButton disabled={Boolean(prefersReducedMotion)}>
                        <Button
                            className="h-14 px-10 bg-white hover:bg-zinc-100 dark:bg-white dark:hover:bg-zinc-100 text-zinc-950 text-base font-semibold rounded-full transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-105"
                            asChild
                        >
                            <a href={homeLinks.contactSales}>
                                {L.contactSales}{' '}
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </a>
                        </Button>
                    </MagneticButton>
                    <Button
                        variant="ghost"
                        className="h-14 px-8 text-zinc-400 dark:text-zinc-300 hover:text-white text-base font-medium rounded-full hover:bg-white/5 hover:dark:bg-white/10 transition-all duration-300"
                        asChild
                    >
                        <a href={homeLinks.exploreFeatures}>
                            {L.exploreFeatures}
                        </a>
                    </Button>
                </motion.div>

                {/* Avatar stack with staggered animation */}
                <motion.div
                    {...entry(0.6)}
                    className="flex flex-col items-center gap-3"
                >
                    <div className="flex -space-x-3" aria-hidden="true">
                        {trustAvatars.map((avatar, index) => (
                            <motion.div
                                key={avatar.initials}
                                initial={{
                                    opacity: 0,
                                    x: prefersReducedMotion ? 0 : -20,
                                }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    delay: prefersReducedMotion
                                        ? 0
                                        : 0.7 + index * 0.1,
                                    duration: 0.4,
                                }}
                                className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatar.gradient} border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg`}
                            >
                                {avatar.initials}
                            </motion.div>
                        ))}
                    </div>
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                            delay: prefersReducedMotion ? 0 : 1.1,
                            duration: 0.4,
                        }}
                        className="text-sm font-medium text-zinc-500 dark:text-zinc-400"
                    >
                        {L.trustedBy}
                    </motion.span>
                </motion.div>
            </motion.div>
        </section>
    );
}
