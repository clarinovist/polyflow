'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, BookOpen, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { isTroubleshootArticle } from '@/lib/bot/help-articles';
import type { NavArticleItem } from '@/lib/bot/help-articles';
import {
    MODULE_FILTERS,
    getModuleLabel,
    SupportSearchBox,
} from '@/components/support/support-article-list';

interface DocsSidebarProps {
    items: NavArticleItem[];
}

/** Group articles by their primary module (`modules[0]`, falling back to
 * `'global'`) and order the groups per `MODULE_FILTERS`, with any modules
 * outside that list appended at the end so nothing silently disappears. */
function groupByModule(
    items: NavArticleItem[],
): Array<[string, NavArticleItem[]]> {
    const groups = new Map<string, NavArticleItem[]>();
    for (const item of items) {
        const key = item.modules[0] ?? 'global';
        const list = groups.get(key) ?? [];
        list.push(item);
        groups.set(key, list);
    }

    const orderedKeys = [
        ...MODULE_FILTERS.filter((m) => groups.has(m)),
        ...[...groups.keys()].filter((k) => !MODULE_FILTERS.includes(k)),
    ];

    return orderedKeys.map((key) => [key, groups.get(key) ?? []]);
}

function NavTree({
    items,
    pathname,
    onNavigate,
}: {
    items: NavArticleItem[];
    pathname: string;
    onNavigate: () => void;
}) {
    const groups = groupByModule(items);

    if (groups.length === 0) {
        return (
            <p className="px-3 py-4 text-xs text-muted-foreground">
                Belum ada artikel.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {groups.map(([key, groupItems]) => (
                <div key={key}>
                    <h3 className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {getModuleLabel(key)}
                    </h3>
                    <ul className="space-y-0.5">
                        {groupItems.map((item) => {
                            const active = pathname === `/support/${item.slug}`;
                            return (
                                <li key={item.slug}>
                                    <Link
                                        href={`/support/${item.slug}`}
                                        onClick={onNavigate}
                                        aria-current={
                                            active ? 'page' : undefined
                                        }
                                        className={cn(
                                            'block rounded-md px-3 py-1.5 text-sm leading-relaxed transition-colors',
                                            active
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                                        )}
                                    >
                                        {item.title}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );
}

export function DocsSidebar({ items }: DocsSidebarProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const closeMobile = () => setMobileOpen(false);

    const isTroubleshootTab = pathname.startsWith('/support/troubleshooting');
    const basePath = isTroubleshootTab
        ? '/support/troubleshooting'
        : '/support';
    const visibleItems = isTroubleshootTab
        ? items.filter(isTroubleshootArticle)
        : items;

    const treeContent = (
        <div className="flex h-full flex-col">
            <div className="mb-4">
                <SupportSearchBox basePath={basePath} />
            </div>
            <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
                <Link
                    href="/support"
                    onClick={closeMobile}
                    aria-current={!isTroubleshootTab ? 'page' : undefined}
                    className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                        !isTroubleshootTab
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <BookOpen className="h-3.5 w-3.5" />
                    Panduan
                </Link>
                <Link
                    href="/support/troubleshooting"
                    onClick={closeMobile}
                    aria-current={isTroubleshootTab ? 'page' : undefined}
                    className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                        isTroubleshootTab
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Troubleshooting
                </Link>
            </div>
            <nav
                className="flex-1 overflow-y-auto pr-1"
                aria-label="Navigasi dokumentasi"
            >
                <NavTree
                    items={visibleItems}
                    pathname={pathname}
                    onNavigate={closeMobile}
                />
            </nav>
        </div>
    );

    return (
        <>
            {/* Mobile toggle — sidebar itself is hidden below lg */}
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="mb-4 inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground lg:hidden"
                aria-label="Buka navigasi dokumentasi"
            >
                <Menu className="h-4 w-4" />
                Navigasi
            </button>

            {/* Desktop sidebar */}
            <aside className="hidden lg:block lg:h-full">{treeContent}</aside>

            {/* Mobile full-screen overlay — z-[60] to stay above the main
                app SidebarNav (fixed header + aside both use z-50). */}
            {mobileOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={closeMobile}
                    />
                    <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm overflow-y-auto bg-background p-4 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                                Navigasi Dokumentasi
                            </span>
                            <button
                                type="button"
                                onClick={closeMobile}
                                className="p-1.5 text-muted-foreground hover:text-foreground"
                                aria-label="Tutup navigasi"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        {treeContent}
                    </div>
                </div>
            )}
        </>
    );
}
