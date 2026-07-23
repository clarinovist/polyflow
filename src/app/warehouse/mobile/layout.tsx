import { WarehouseBottomNav } from "@/components/warehouse/mobile/WarehouseBottomNav";

export default function WarehouseMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">{children}</main>
      <WarehouseBottomNav />
    </div>
  );
}
