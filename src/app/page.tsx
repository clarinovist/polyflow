import { Metadata } from 'next';
import PublicNavEnhanced from '@/components/home/public-nav-enhanced';
import HeroSectionEnhanced from '@/components/home/hero-section-enhanced';
import FeaturesSectionEnhanced from '@/components/home/features-section-enhanced';
import TestimonialSectionEnhanced from '@/components/home/testimonial-section-enhanced';
import CtaSectionEnhanced from '@/components/home/cta-section-enhanced';
import PublicFooterEnhanced from '@/components/home/public-footer-enhanced';

export const metadata: Metadata = {
    title: 'PolyFlow | ERP Produksi untuk Pabrik Plastik Berbasis Ekstrusi',
    description:
        'PolyFlow menghubungkan pesanan, bahan, produksi, hasil, scrap, stok, pengiriman, dan invoice untuk pabrik plastik berbasis ekstrusi.',
};

export default function Home() {
    return (
        <div className="bg-zinc-950 min-h-screen text-foreground selection:bg-white/10 selection:text-white">
            <PublicNavEnhanced />

            <main>
                <HeroSectionEnhanced />
                <FeaturesSectionEnhanced />
                <TestimonialSectionEnhanced />
                <CtaSectionEnhanced />
            </main>

            <PublicFooterEnhanced />
        </div>
    );
}
