'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('system');
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        // Load theme from localStorage on mount
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setThemeState(stored);
        }
    }, []);

    useEffect(() => {
        const root = document.documentElement;

        // Determine the actual theme to apply
        let actualTheme: 'light' | 'dark' = 'light';

        if (theme === 'system') {
            const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches;
            actualTheme = systemPreference ? 'dark' : 'light';
        } else {
            actualTheme = theme;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setResolvedTheme(actualTheme);

        // Apply theme
        root.classList.remove('light', 'dark');
        root.classList.add(actualTheme);

        // Store preference
        localStorage.setItem('theme', theme);

        // Listen for system preference changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            if (theme === 'system') {
                const systemPreference = mediaQuery.matches ? 'dark' : 'light';
                setResolvedTheme(systemPreference);
                root.classList.remove('light', 'dark');
                root.classList.add(systemPreference);
            }
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
}
