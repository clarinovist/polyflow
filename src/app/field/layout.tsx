import { FieldBottomNav } from "@/components/field/FieldBottomNav";
import { FieldMobileFrame } from "@/components/field/FieldMobileFrame";
import { auth } from "@/auth";
import { getMyPermissions } from "@/actions/admin/permissions";
import { isMobileUserAgent } from "@/lib/mobile/mobile-access-policy";
import { headers } from "next/headers";

export default async function FieldLayout({
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

  const headerStore = await headers();
  const userAgent = headerStore.get("user-agent") || "";
  const isMobile = isMobileUserAgent(userAgent);

  const content = (
    <div className="min-h-screen bg-background">
      <main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">{children}</main>
      <FieldBottomNav permissions={permissions} />
    </div>
  );

  if (isMobile) {
    return content;
  }

  return <FieldMobileFrame>{content}</FieldMobileFrame>;
}
