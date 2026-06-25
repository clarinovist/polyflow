import { Metadata } from "next";
import PublicNavEnhanced from "@/components/home/public-nav-enhanced";
import PublicFooterEnhanced from "@/components/home/public-footer-enhanced";

export const metadata: Metadata = {
  title: "Terms of Service | PolyFlow ERP",
  description:
    "Terms of Service for PolyFlow ERP - Advanced Plastic Converting Software",
};

export default function TermsPage() {
  return (
    <div className="bg-zinc-950 min-h-screen text-foreground">
      <PublicNavEnhanced />

      <main className="container mx-auto px-6 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-zinc-300">
              By accessing and using PolyFlow ERP (&quot;the Service&quot;), you
              accept and agree to be bound by the terms and provision of this
              agreement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
            <p className="text-zinc-300">
              Permission is granted to temporarily use the Service for personal,
              non-commercial transitory viewing only. This is the grant of a
              license, not a transfer of title.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. User Account</h2>
            <p className="text-zinc-300">
              To access certain features of the Service, you must register for
              an account. You agree to provide accurate, current, and complete
              information during registration.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Privacy Policy</h2>
            <p className="text-zinc-300">
              Your use of the Service is also governed by our Privacy Policy,
              which is incorporated into these Terms by reference.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">
              5. Limitation of Liability
            </h2>
            <p className="text-zinc-300">
              In no event shall PolyFlow be liable for any damages arising out
              of the use or inability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Changes to Terms</h2>
            <p className="text-zinc-300">
              PolyFlow reserves the right to modify these terms at any time.
              Continued use of the Service constitutes acceptance of modified
              terms.
            </p>
          </section>
        </div>
      </main>

      <PublicFooterEnhanced />
    </div>
  );
}
