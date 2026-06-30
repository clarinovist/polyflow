"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

interface BudgetingTabsProps {
  activeTab: "overview" | "input" | "variance";
}

const tabs = [
  { value: "overview" as const, label: "Anggaran vs Aktual", href: "/finance/budgeting" },
  { value: "input" as const, label: "Input Anggaran", href: "/finance/budgeting/input" },
  { value: "variance" as const, label: "Varians Anggaran", href: "/finance/budgeting/variance" },
];

export function BudgetingTabs({ activeTab }: BudgetingTabsProps) {
  return (
    <Tabs value={activeTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 md:w-[480px]">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
