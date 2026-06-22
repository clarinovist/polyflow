'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useRef } from 'react';

// Ripple effect component
function RippleEffect() {
  return (
    <motion.div
      className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none"
      initial={{ opacity: 0 }}
      whileHover={{ opacity: 1 }}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10"
        animate={{
          background: [
            "linear-gradient(0deg, rgba(59,130,246,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(236,72,153,0.1) 100%)",
            "linear-gradient(120deg, rgba(59,130,246,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(236,72,153,0.1) 100%)",
            "linear-gradient(240deg, rgba(59,130,246,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(236,72,153,0.1) 100%)",
            "linear-gradient(360deg, rgba(59,130,246,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(236,72,153,0.1) 100%)",
          ],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
    </motion.div>
  );
}

// Floating shapes component
function FloatingShapes() {
  const shapes = [
    { x: 10, y: 20, size: 60, delay: 0, color: "bg-blue-500/10" },
    { x: 80, y: 30, size: 40, delay: 1, color: "bg-purple-500/10" },
    { x: 20, y: 70, size: 50, delay: 2, color: "bg-pink-500/10" },
    { x: 70, y: 80, size: 30, delay: 3, color: "bg-indigo-500/10" },
  ];

  return (
    <>
      {shapes.map((shape, index) => (
        <motion.div
          key={index}
          className={`absolute ${shape.color} rounded-full blur-xl pointer-events-none`}
          style={{
            left: `${shape.x}%`,
            top: `${shape.y}%`,
            width: shape.size,
            height: shape.size,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: shape.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}

export default function CtaSectionEnhanced() {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-200, 200], [5, -5]);
  const rotateY = useTransform(x, [-200, 200], [-5, 5]);

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
    <section id="contact" className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-zinc-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.04]" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Animated gradient background */}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-[130px] pointer-events-none"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.06, 0.1, 0.06],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating shapes */}
      <FloatingShapes />

      <div className="container mx-auto px-6 max-w-4xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="relative text-center"
        >
          <motion.div
            ref={ref}
            style={{ rotateX, rotateY, perspective: 1000 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="relative"
          >
            <div className="bg-zinc-900/40 border border-white/10 rounded-3xl p-14 md:p-20 backdrop-blur-sm relative overflow-hidden">
              {/* Ripple effect */}
              <RippleEffect />

              {/* Decorative gradient corners */}
              <motion.div
                className="absolute top-0 left-0 w-40 h-40 bg-gradient-to-br from-blue-500/20 to-transparent rounded-3xl pointer-events-none"
                animate={{
                  opacity: [0.1, 0.2, 0.1],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-purple-500/20 to-transparent rounded-3xl pointer-events-none"
                animate={{
                  opacity: [0.1, 0.2, 0.1],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />

              {/* Animated border glow */}
              <div className="absolute inset-0 rounded-3xl opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-[-1px] rounded-3xl bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-pink-500/30 opacity-50 blur-sm" />
              </div>

              <div className="relative z-10">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8"
                >
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-zinc-300">Mulai Sekarang</span>
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight"
                >
                  Ready to optimize{' '}
                  <span className="bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                    your factory?
                  </span>
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-zinc-400 text-lg mb-10 max-w-2xl mx-auto"
                >
                  Contact us today to schedule a demo and see how PolyFlow can be tailored for your specific manufacturing needs.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Button className="h-14 px-10 bg-white hover:bg-zinc-100 text-zinc-950 text-lg font-semibold rounded-full shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] transition-all duration-300">
                      Contact Sales <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Button variant="ghost" className="h-14 px-8 text-zinc-400 hover:text-white text-lg font-medium rounded-full hover:bg-white/5 transition-all duration-300" asChild>
                      <a href="/register">Create Workspace</a>
                    </Button>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
