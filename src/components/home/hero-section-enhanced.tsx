'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { heroLabels as L } from '@/lib/labels/home';
import { useRef, useMemo } from 'react';

// Animated gradient text component
function AnimatedGradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient ${className}`}>
      {children}
    </span>
  );
}

// Floating particle component
function FloatingParticle({ delay, x, y, size }: { delay: number; x: number; y: number; size: number }) {
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
        ease: "easeInOut",
      }}
    />
  );
}

// Magnetic button wrapper
function MagneticButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-100, 100], [5, -5]);
  const rotateY = useTransform(x, [-100, 100], [-5, 5]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    animate(x, 0, { type: "spring", stiffness: 300, damping: 20 });
    animate(y, 0, { type: "spring", stiffness: 300, damping: 20 });
  };

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

export default function HeroSectionEnhanced() {
  // Generate particles with seeded random for consistent server/client render
  const particles = useMemo(() => {
    const random = seededRandom(42);
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      delay: i * 0.2,
      x: random() * 100,
      y: random() * 100,
      size: random() * 4 + 2,
    }));
  }, []);

  return (
    <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-36 overflow-hidden flex flex-col items-center justify-center text-center px-6">
      {/* Multi-layer background */}
      <div className="absolute inset-0 bg-zinc-950" />
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent" />

      {/* Floating orbs — more visible */}
      <motion.div
        className="absolute top-20 left-1/4 w-80 h-80 bg-blue-500/15 rounded-full blur-[100px] pointer-events-none"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.2, 0.15],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-20 right-1/4 w-[28rem] h-[28rem] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-indigo-500/[0.07] rounded-full blur-[150px] pointer-events-none"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
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
      <div className="absolute -top-10 -right-20 pointer-events-none opacity-[0.08]">
        <motion.div
          className="relative w-[500px] h-[500px]"
          animate={{ rotateY: [0, 5, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 transform translate-x-6 translate-y-6">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <path d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60" stroke="#4a4a4a" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <div className="absolute inset-0 transform translate-x-3 translate-y-3">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <path d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60" stroke="#555555" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          <div className="absolute inset-0">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <path d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60" stroke="#666666" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-5xl mx-auto flex flex-col items-center"
      >
        {/* Badge with shimmer */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8 relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: [-200, 200] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <Sparkles className="w-4 h-4 text-blue-400 relative z-10" />
          <span className="text-sm font-medium text-zinc-300 dark:text-zinc-200 relative z-10">{L.badge}</span>
        </motion.div>

        {/* Animated headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white mb-8 leading-[0.95]"
        >
          {L.headline}{' '}
          <AnimatedGradientText>{L.headlineAccent}</AnimatedGradientText>{' '}
          {L.headlineEnd}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-lg md:text-xl text-zinc-400 dark:text-zinc-300 max-w-2xl mb-12 leading-relaxed"
        >
          {L.tagline}
        </motion.p>

        {/* CTA Buttons with magnetic effect */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 mb-16"
        >
          <MagneticButton>
            <Button className="h-14 px-10 bg-white hover:bg-zinc-100 dark:bg-white dark:hover:bg-zinc-100 text-zinc-950 text-base font-semibold rounded-full transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-105">
              {L.contactSales} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </MagneticButton>
          <Button variant="ghost" className="h-14 px-8 text-zinc-400 dark:text-zinc-300 hover:text-white text-base font-medium rounded-full hover:bg-white/5 hover:dark:bg-white/10 transition-all duration-300" asChild>
            <a href="#features">{L.exploreFeatures}</a>
          </Button>
        </motion.div>

        {/* Avatar stack with staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex -space-x-3">
            {['JD', 'AK', 'MR', '+1K'].map((initials, index) => (
              <motion.div
                key={initials}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                className={`w-10 h-10 rounded-full bg-gradient-to-br from-${
                  index === 0 ? 'blue' : index === 1 ? 'purple' : index === 2 ? 'orange' : 'emerald'
                }-400 to-${
                  index === 0 ? 'blue' : index === 1 ? 'purple' : index === 2 ? 'orange' : 'emerald'
                }-600 border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg`}
              >
                {initials}
              </motion.div>
            ))}
          </div>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.4 }}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400"
          >
            {L.trustedBy}
          </motion.span>
        </motion.div>
      </motion.div>
    </section>
  );
}
