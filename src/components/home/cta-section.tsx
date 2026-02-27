'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function CtaSection() {
    return (
        <section id="contact" className="py-28 relative overflow-hidden">
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.06),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.04]" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] bg-blue-500/[0.06] rounded-full blur-[130px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-4xl relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.7 }}
                    className="relative text-center"
                >
                    <div className="bg-zinc-900/40 border border-white/10 rounded-3xl p-14 md:p-20 backdrop-blur-sm relative overflow-hidden">
                        {/* Decorative gradient corners */}
                        <div className="absolute top-0 left-0 w-40 h-40 bg-gradient-to-br from-blue-500/10 to-transparent rounded-3xl pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-purple-500/10 to-transparent rounded-3xl pointer-events-none" />

                        <div className="relative z-10">
                            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                                Ready to optimize{' '}
                                <span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                                    your factory?
                                </span>
                            </h2>
                            <p className="text-zinc-400 text-lg mb-10 max-w-2xl mx-auto">
                                Contact us today to schedule a demo and see how PolyFlow can be tailored for your specific manufacturing needs.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Button className="h-14 px-10 bg-white hover:bg-zinc-100 text-zinc-950 text-lg font-semibold rounded-full shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-105 transition-all duration-300">
                                    Contact Sales <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                                <Button variant="ghost" className="h-14 px-8 text-zinc-400 hover:text-white text-lg font-medium rounded-full hover:bg-white/5 transition-all duration-300" asChild>
                                    <a href="/register">Create Workspace</a>
                                </Button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
