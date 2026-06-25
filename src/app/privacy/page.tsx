import { Metadata } from "next";
import PublicNavEnhanced from "@/components/home/public-nav-enhanced";
import PublicFooterEnhanced from "@/components/home/public-footer-enhanced";

export const metadata: Metadata = {
  title: "Privacy Policy | PolyFlow ERP",
  description:
    "Privacy Policy for PolyFlow ERP - Advanced Plastic Converting Software",
};

export default function PrivacyPage() {
  return (
    <div className="bg-zinc-950 min-h-screen text-foreground">
      <PublicNavEnhanced />

      <main className="container mx-auto px-6 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

        <div className="prose prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">
              1. Information We Collect
            </h2>
            <p className="text-zinc-300">
              We collect information you provide directly to us, such as when
              you create an account, use our services, or contact us for
              support.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-zinc-300">
              We use the information we collect to provide, maintain, and
              improve our services, to process transactions, and to send you
              technical notices and support messages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">
              3. Information Sharing
            </h2>
            <p className="text-zinc-300">
              We do not sell or rent your personal information to third parties.
              We may share your information only with your consent or as
              required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p className="text-zinc-300">
              We implement appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              alteration, disclosure, or destruction.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
            <p className="text-zinc-300">
              We retain your information for as long as your account is active
              or as needed to provide you services. We will also retain your
              information as necessary to comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
            <p className="text-zinc-300">
              You have the right to access, correct, or delete your personal
              information. You may also object to or restrict the processing of
              your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Contact Us</h2>
            <p className="text-zinc-300">
              If you have any questions about this Privacy Policy, please
              contact us at privacy@polyflow.uk.
            </p>
          </section>
        </div>
      </main>

      <PublicFooterEnhanced />
    </div>
  );
}
