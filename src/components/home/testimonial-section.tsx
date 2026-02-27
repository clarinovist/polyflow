'use client';

import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';

export default function TestimonialSection() {
    const testimonials = [
        {
            quote: "PolyFlow completely transformed how we track our extrusion processes. Material waste dropped by 15% in our first quarter.",
            author: "Sarah Jenkins",
            title: "Operations Director",
            company: "CorePlastics",
            gradient: 'from-blue-500 to-cyan-500',
        },
        {
            quote: "Finally, an ERP that understands the nuance of plastic converting. The integration between warehouse and sales is incredibly smooth.",
            author: "Marcus Chen",
            title: "CEO",
            company: "NexaPackaging",
            gradient: 'from-purple-500 to-pink-500',
        },
        {
            quote: "We used to rely on spreadsheets for our production scheduling. Now, everything is automated and we have total visibility.",
            author: "David O'Connor",
            title: "Plant Manager",
            company: "FlexiWrap Industries",
            gradient: 'from-emerald-500 to-teal-500',
        }
    ];

    return (
        <section id="testimonials" className="py-28 relative overflow-hidden">
            <div className="absolute inset-0 bg-zinc-950" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(120,119,198,0.08),transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.04]" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="absolute top-1/4 left-10 w-72 h-72 bg-purple-500/[0.06] rounded-full blur-[100px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-6xl relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4 block">Testimonials</span>
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-5">Trusted by Industry Leaders</h2>
                    <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
                        See how manufacturing teams are scaling their operations with PolyFlow.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {testimonials.map((t, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.15, duration: 0.5 }}
                            className="group relative p-8 rounded-2xl border border-white/5 bg-zinc-900/20 hover:bg-zinc-900/40 flex flex-col justify-between h-full transition-all duration-500"
                        >
                            <div>
                                <Quote className="w-8 h-8 text-zinc-700 mb-5 group-hover:text-zinc-500 transition-colors duration-300" />
                                <p className="text-zinc-300 mb-8 leading-relaxed">
                                    {t.quote}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-xs font-bold shadow-lg`}>
                                    {t.author.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div>
                                    <p className="text-white font-semibold text-sm">{t.author}</p>
                                    <p className="text-zinc-500 text-xs">{t.title}, {t.company}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
