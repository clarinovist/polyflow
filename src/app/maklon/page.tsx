import Link from "next/link";
import { PackageSearch, RotateCcw, Plus, Warehouse, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { maklonSidebarLabels } from "@/lib/labels";

const hubs = [
  {
    heading: "Operasi",
    items: [
      {
        href: "/maklon/receipts",
        icon: PackageSearch,
        title: maklonSidebarLabels.receipts,
        description: "Pantau penerimaan bahan milik customer untuk order Maklon Jasa",
      },
      {
        href: "/warehouse/incoming/create-maklon",
        icon: Plus,
        title: maklonSidebarLabels.newReceipt,
        description: "Catat penerimaan material maklon baru ke stok customer-owned",
      },
      {
        href: "/maklon/returns",
        icon: RotateCcw,
        title: maklonSidebarLabels.returns,
        description: "Kelola retur sisa bahan customer setelah proses maklon",
      },
      {
        href: "/maklon/returns/create",
        icon: Plus,
        title: maklonSidebarLabels.newReturn,
        description: "Buat retur sisa material ke customer",
      },
    ],
  },
  {
    heading: "Terkait",
    items: [
      {
        href: "/warehouse",
        icon: Warehouse,
        title: maklonSidebarLabels.warehousePortal,
        description: "Operasional gudang harian, termasuk alias maklon di portal stok",
      },
    ],
  },
];

export default function MaklonDashboardPage() {
  return (
    <div className="flex flex-col space-y-8">
      <PageHeader
        title="Portal Maklon"
        description="Kelola penerimaan dan retur material milik customer untuk Maklon Jasa."
      />

      {hubs.map((group) => (
        <section key={group.heading} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {group.heading}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className="h-full transition-colors hover:border-amber-300 hover:bg-amber-50/40 dark:hover:border-amber-800 dark:hover:bg-amber-950/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-base font-semibold">
                        {item.title}
                      </CardTitle>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
