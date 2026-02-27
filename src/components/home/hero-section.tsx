'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function HeroSection() {
    return (
        <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-36 overflow-hidden flex flex-col items-center justify-center text-center px-6">
            {/* Multi-layer background */}
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,119,198,0.15),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.08),transparent_50%)]" />
            {/* Dot grid pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.12]" />
            {/* Horizontal lines for depth */}
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_49.5%,rgba(255,255,255,0.03)_50%,transparent_50.5%)] [background-size:100%_48px]" />

            {/* Floating orbs — more visible */}
            <div className="absolute top-20 left-1/4 w-80 h-80 bg-blue-500/15 rounded-full blur-[100px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-20 right-1/4 w-[28rem] h-[28rem] bg-purple-500/10 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-indigo-500/[0.07] rounded-full blur-[150px] pointer-events-none" />

            {/* Decorative 3D P logo background like brand-panel */}
            <div className="absolute -top-10 -right-20 pointer-events-none opacity-[0.08]">
                <div className="relative w-[500px] h-[500px]">
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
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 max-w-5xl mx-auto flex flex-col items-center"
            >
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8"
                >
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-zinc-300">Built for Plastic Converting Industry</span>
                </motion.div>

                <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white mb-8 leading-[0.95]">
                    Streamline your{' '}
                    <span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                        manufacturing
                    </span>{' '}
                    operations
                </h1>

                <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-12 leading-relaxed">
                    Advanced Plastic Converting ERP System. Unify your warehouse, production, sales, and finance in one powerful platform.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
                    <Button className="h-14 px-10 bg-white hover:bg-zinc-100 text-zinc-950 text-base font-semibold rounded-full transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-105">
                        Contact Sales <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button variant="ghost" className="h-14 px-8 text-zinc-400 hover:text-white text-base font-medium rounded-full hover:bg-white/5 transition-all duration-300" asChild>
                        <a href="#features">Explore Features</a>
                    </Button>
                </div>

                {/* Avatar stack — matches brand-panel gradient style */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.6 }}
                    className="flex flex-col items-center gap-3"
                >
                    <div className="flex -space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg">JD</div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg">AK</div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg">MR</div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-zinc-950 flex items-center justify-center text-white text-xs font-medium shadow-lg">+1K</div>
                    </div>
                    <span className="text-sm font-medium text-zinc-500">Trusted by 1,000+ manufacturers worldwide</span>
                </motion.div>
            </motion.div>
        </section>
    );
}
