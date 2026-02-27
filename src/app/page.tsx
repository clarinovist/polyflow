import { Metadata } from 'next';
import PublicNav from '@/components/home/public-nav';
import HeroSection from '@/components/home/hero-section';
import FeaturesSection from '@/components/home/features-section';
import TestimonialSection from '@/components/home/testimonial-section';
import CtaSection from '@/components/home/cta-section';
import PublicFooter from '@/components/home/public-footer';

export const metadata: Metadata = {
  title: 'PolyFlow ERP | Advanced Plastic Converting Software',
  description: 'Unify your warehouse, production, sales, and finance in one powerful platform built for plastic converting businesses.',
};

export default function Home() {
  return (
    <div className="bg-zinc-950 min-h-screen text-foreground selection:bg-white/10 selection:text-white">
      <PublicNav />

      <main>
        <HeroSection />
        <FeaturesSection />
        <TestimonialSection />
        <CtaSection />
      </main>

      <PublicFooter />
    </div>
  );
}
