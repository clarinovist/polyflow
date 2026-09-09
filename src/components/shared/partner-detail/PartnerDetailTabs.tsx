'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface PartnerDetailTabGroup {
    value: string;
    label: string;
    tabs: { value: string; label: string }[];
}

export function resolvePartnerTab(
    groups: PartnerDetailTabGroup[],
    value?: string | null,
) {
    return groups
        .flatMap((group) => group.tabs)
        .some((tab) => tab.value === value)
        ? value!
        : groups[0].tabs[0].value;
}

/** A leaf value keeps existing deep links independent of the visual grouping. */
export function PartnerDetailTabs({
    groups,
    value,
    onValueChange,
    children,
}: {
    groups: PartnerDetailTabGroup[];
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
}) {
    const active = resolvePartnerTab(groups, value);
    const group = groups.find((item) =>
        item.tabs.some((tab) => tab.value === active),
    )!;
    return (
        <Tabs
            value={group.value}
            onValueChange={(next) =>
                onValueChange(
                    groups.find((item) => item.value === next)!.tabs[0].value,
                )
            }
            activationMode="manual"
        >
            <TabsList
                aria-label="Bagian detail"
                className="flex h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-b bg-transparent p-0"
            >
                {groups.map((item) => (
                    <TabsTrigger
                        key={item.value}
                        value={item.value}
                        className="min-h-11 shrink-0 rounded-none border-b-2 border-transparent px-1 text-sm data-[state=active]:border-emerald-700 data-[state=active]:bg-transparent data-[state=active]:text-emerald-800 data-[state=active]:shadow-none dark:data-[state=active]:border-emerald-400 dark:data-[state=active]:text-emerald-300"
                    >
                        {item.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <p className="mt-2 text-[11px] text-muted-foreground lg:hidden">
                Geser menu untuk melihat bagian lainnya →
            </p>
            {groups.map((item) => (
                <TabsContent
                    key={item.value}
                    value={item.value}
                    className="mt-3 min-w-0"
                >
                    {group.value === item.value &&
                        (item.tabs.length > 1 ? (
                            <Tabs
                                value={active}
                                onValueChange={onValueChange}
                                activationMode="manual"
                            >
                                <TabsList
                                    aria-label={item.label}
                                    className="mb-2 flex h-auto w-fit max-w-full justify-start overflow-x-auto"
                                >
                                    {item.tabs.map((tab) => (
                                        <TabsTrigger
                                            key={tab.value}
                                            value={tab.value}
                                            className="min-h-10 shrink-0 text-xs"
                                        >
                                            {tab.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {item.tabs.map((tab) => (
                                    <TabsContent
                                        key={tab.value}
                                        value={tab.value}
                                        className="min-w-0"
                                    >
                                        {tab.value === active && children}
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            children
                        ))}
                </TabsContent>
            ))}
        </Tabs>
    );
}
