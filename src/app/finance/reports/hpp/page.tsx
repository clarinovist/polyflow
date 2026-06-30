import { Metadata } from "next";
import HppReportClient from "./HppReportClient";

export const metadata: Metadata = {
  title: "Laporan HPP",
};

export const dynamic = "force-dynamic";

export default function HppReportPage() {
  return (
    <div className="space-y-6">
      <HppReportClient />
    </div>
  );
}
