import { redirect } from "next/navigation";

export default async function PurchasingDashboardPage() {
  redirect("/purchasing/requests");
}
