import { BottomNav } from "@/components/sales/mobile/BottomNav";

export default function SalesMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
