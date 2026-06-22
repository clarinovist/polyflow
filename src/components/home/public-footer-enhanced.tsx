'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { footerLabels as L } from '@/lib/labels/home';
import { Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const footerLinks = {
  product: [
    { label: 'Features', href: '#features' },
    { label: 'Testimonials', href: '#testimonials' },
    { label: 'Contact Sales', href: '#contact' },
  ],
  company: [
    { label: 'Register', href: '/register' },
    { label: 'Tenant Login', href: '/login' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
  ],
};

const socialLinks = [
  { name: 'LinkedIn', href: '#', icon: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z' },
  { name: 'Twitter', href: '#', icon: 'M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z' },
  { name: 'GitHub', href: '#', icon: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' },
];

export default function PublicFooterEnhanced() {
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubscribed(true);
      setEmail('');
      setTimeout(() => setIsSubscribed(false), 3000);
    }
  };

  return (
    <footer className="relative bg-zinc-950 border-t border-white/5">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(120,119,198,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03]" />

      <div className="container mx-auto px-6 max-w-6xl relative z-10">
        {/* Main footer content */}
        <div className="py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2"
          >
            <h3 className="text-xl font-bold text-white mb-4">PolyFlow ERP</h3>
            <p className="text-zinc-400 mb-6 max-w-md leading-relaxed">
              {L.description}
            </p>

            {/* Newsletter signup */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-white mb-3">Subscribe untuk update</h4>
              <form onSubmit={handleSubscribe} className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email anda"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    required
                  />
                </div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Button
                    type="submit"
                    size="icon"
                    className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </motion.div>
              </form>
              {isSubscribed && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-emerald-400 mt-2"
                >
                  Terima kasih telah subscribe!
                </motion.p>
              )}
            </div>

            {/* Social links */}
            <div className="flex gap-4">
              {socialLinks.map((social, index) => (
                <motion.div
                  key={social.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.4 }}
                >
                  <motion.a
                    href={social.href}
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label={social.name}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d={social.icon} />
                    </svg>
                  </motion.a>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Product links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.6 }}
          >
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">{L.product}</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <motion.div whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                    <Link
                      href={link.href}
                      className="text-zinc-400 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Company links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h4 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">{L.company}</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <motion.div whileHover={{ x: 4 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                    <Link
                      href={link.href}
                      className="text-zinc-400 hover:text-white transition-colors text-sm"
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="py-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <p className="text-zinc-500 text-sm">
            © {new Date().getFullYear()} PolyFlow ERP Systems. Hak cipta dilindungi.
          </p>
          <p className="text-zinc-600 text-xs">
            {L.craftedFor}
          </p>
        </motion.div>
      </div>
    </footer>
  );
}
