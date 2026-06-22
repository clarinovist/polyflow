'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const testimonials = [
  {
    name: 'Budi Santoso',
    role: 'Operations Director',
    company: 'PT Plastik Mandiri',
    content: 'PolyFlow telah mengubah cara kami mengelola operasi manufaktur. Efisiensi produksi meningkat 35% dalam 3 bulan pertama.',
    avatar: 'BS',
    gradient: 'from-blue-400 to-blue-600',
    rating: 5,
  },
  {
    name: 'Siti Rahayu',
    role: 'Finance Manager',
    company: 'CV Sumber Jaya',
    content: 'Integrasi keuangan yang luar biasa. Kami bisa melihat profitabilitas real-time untuk setiap produk dan lini produksi.',
    avatar: 'SR',
    gradient: 'from-purple-400 to-purple-600',
    rating: 5,
  },
  {
    name: 'Ahmad Hidayat',
    role: 'Warehouse Supervisor',
    company: 'PT Indoplas',
    content: 'Manajemen inventaris jauh lebih baik. Stok opname yang dulu butuh 2 hari, sekarang selesai dalam 2 jam.',
    avatar: 'AH',
    gradient: 'from-emerald-400 to-emerald-600',
    rating: 5,
  },
  {
    name: 'Dewi Lestari',
    role: 'Sales Director',
    company: 'PT Maju Bersama',
    content: 'CRM terintegrasi membantu kami meningkatkan repeat order sebesar 28%. Dashboard analitiknya sangat powerful.',
    avatar: 'DL',
    gradient: 'from-orange-400 to-orange-600',
    rating: 5,
  },
];

export default function TestimonialSectionEnhanced() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  const next = () => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  // Auto-play
  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, []);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  return (
    <section id="testimonials" className="py-28 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-zinc-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(120,119,198,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.06]" />

      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      <div className="container mx-auto px-6 max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4 block"
          >
            Testimoni
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-3xl md:text-5xl font-bold text-white mb-5"
          >
            Dipercaya oleh Industri
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-zinc-400 max-w-2xl mx-auto text-lg"
          >
            Lihat bagaimana PolyFlow membantu bisnis konversi plastik meningkatkan efisiensi dan profitabilitas.
          </motion.p>
        </motion.div>

        {/* Testimonial Carousel */}
        <div className="relative">
          <div className="overflow-hidden rounded-3xl">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={current}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="w-full"
              >
                <div className="bg-zinc-900/40 border border-white/10 rounded-3xl p-8 md:p-12 backdrop-blur-sm relative overflow-hidden">
                  {/* Gradient corner accents */}
                  <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-3xl pointer-events-none" />
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-purple-500/10 to-transparent rounded-3xl pointer-events-none" />

                  {/* Quote icon */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 0.1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="absolute top-8 right-8 text-6xl text-white font-serif"
                  >
                    &ldquo;
                  </motion.div>

                  <div className="relative z-10">
                    {/* Stars */}
                    <div className="flex gap-1 mb-6">
                      {Array.from({ length: testimonials[current].rating }).map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.1 + i * 0.1, duration: 0.3 }}
                        >
                          <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                        </motion.div>
                      ))}
                    </div>

                    {/* Content */}
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.5 }}
                      className="text-lg md:text-xl text-zinc-300 mb-8 leading-relaxed"
                    >
                      &ldquo;{testimonials[current].content}&rdquo;
                    </motion.p>

                    {/* Author */}
                    <div className="flex items-center gap-4">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonials[current].gradient} flex items-center justify-center text-white font-semibold shadow-lg`}
                      >
                        {testimonials[current].avatar}
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4, duration: 0.4 }}
                      >
                        <h4 className="font-semibold text-white">{testimonials[current].name}</h4>
                        <p className="text-sm text-zinc-400">
                          {testimonials[current].role} • {testimonials[current].company}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                variant="outline"
                size="icon"
                onClick={prev}
                className="rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </motion.div>

            {/* Dots */}
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <motion.button
                  key={index}
                  onClick={() => {
                    setDirection(index > current ? 1 : -1);
                    setCurrent(index);
                  }}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === current ? 'bg-white' : 'bg-zinc-600'
                  }`}
                  whileHover={{ scale: 1.3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                />
              ))}
            </div>

            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                variant="outline"
                size="icon"
                onClick={next}
                className="rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
