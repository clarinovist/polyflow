'use client';

import Link from 'next/link';
import PolyFlowLogo from '@/components/auth/polyflow-logo';

export default function PublicFooter() {
    return (
        <footer className="relative bg-zinc-950 pt-20 pb-10">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="container mx-auto px-6 max-w-6xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    <div className="col-span-1 md:col-span-2">
                        <Link href="/" className="inline-block mb-5">
                            <PolyFlowLogo variant="dark" size="sm" />
                        </Link>
                        <p className="text-zinc-500 text-sm max-w-sm leading-relaxed">
                            Advanced Plastic Converting ERP System built for modern manufacturing operations. Streamline your warehouse, production, sales, and finance.
                        </p>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-5 text-sm uppercase tracking-wider">Product</h4>
                        <ul className="space-y-3 text-sm text-zinc-500">
                            <li><Link href="#features" className="hover:text-white transition-colors duration-300">Features</Link></li>
                            <li><Link href="#testimonials" className="hover:text-white transition-colors duration-300">Testimonials</Link></li>
                            <li><Link href="#contact" className="hover:text-white transition-colors duration-300">Contact Sales</Link></li>
                            <li><Link href="/register" className="hover:text-white transition-colors duration-300">Register</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-5 text-sm uppercase tracking-wider">Company</h4>
                        <ul className="space-y-3 text-sm text-zinc-500">
                            <li><Link href="/login" className="hover:text-white transition-colors duration-300">Tenant Login</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors duration-300">Terms of Service</Link></li>
                            <li><Link href="#" className="hover:text-white transition-colors duration-300">Privacy Policy</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-600 gap-4">
                    <p>&copy; {new Date().getFullYear()} PolyFlow ERP Systems. All rights reserved.</p>
                    <p className="text-zinc-700">Crafted for the plastic converting industry.</p>
                </div>
            </div>
        </footer>
    );
}
