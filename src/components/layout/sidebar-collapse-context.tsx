'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SidebarCollapseContextValue {
    isCollapsed: boolean;
    toggle: () => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue>({
    isCollapsed: false,
    toggle: () => {},
});

const STORAGE_KEY = 'sidebar-collapsed';

function getInitialCollapsed(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsed);

    const toggle = useCallback(() => {
        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <SidebarCollapseContext.Provider value={{ isCollapsed, toggle }}>
            {children}
        </SidebarCollapseContext.Provider>
    );
}

export function useSidebarCollapse() {
    return useContext(SidebarCollapseContext);
}
