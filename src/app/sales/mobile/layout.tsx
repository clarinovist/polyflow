import { BottomNav } from "@/components/sales/mobile/BottomNav";
import { auth } from "@/auth";
import { getMyPermissions } from "@/actions/admin/permissions";

export default async function SalesMobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const sessionAllowed =
    (session?.user as { allowedResources?: string[] })?.allowedResources || [];
  const permissionsRes = await getMyPermissions();
  const permissions: string[] | "ALL" =
    permissionsRes.success && permissionsRes.data
      ? permissionsRes.data
      : sessionAllowed;

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-16">{children}</main>
      <BottomNav permissions={permissions} />
    </div>
  );
}
