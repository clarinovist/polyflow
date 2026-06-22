import { Metadata } from 'next';
import PublicNavEnhanced from '@/components/home/public-nav-enhanced';
import HeroSectionEnhanced from '@/components/home/hero-section-enhanced';
import FeaturesSectionEnhanced from '@/components/home/features-section-enhanced';
import TestimonialSectionEnhanced from '@/components/home/testimonial-section-enhanced';
import CtaSectionEnhanced from '@/components/home/cta-section-enhanced';
import PublicFooterEnhanced from '@/components/home/public-footer-enhanced';

export const metadata: Metadata = {
  title: 'PolyFlow ERP | Advanced Plastic Converting Software',
  description: 'Unify your warehouse, production, sales, and finance in one powerful platform built for plastic converting businesses.',
};

export default function HomeEnhanced() {
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
