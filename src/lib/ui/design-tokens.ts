/**
 * PolyFlow Design Tokens
 * 
 * Centralized design tokens for consistent styling across the application.
 * Import these tokens instead of hardcoding values.
 */

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
    // Primary - Used for main actions and emphasis
    primary: {
        DEFAULT: '#18181b', // zinc-900
        foreground: '#fafafa',
        hover: '#27272a', // zinc-800
    },

    // Background colors
    background: {
        light: '#ffffff',
        dark: '#09090b', // zinc-950
        muted: '#f4f4f5', // zinc-100
    },

    // Text colors
    text: {
        primary: '#18181b', // zinc-900
        secondary: '#71717a', // zinc-500
        muted: '#a1a1aa', // zinc-400
        inverse: '#fafafa',
    },

    // Border colors
    border: {
        light: '#e4e4e7', // zinc-200
        dark: '#27272a', // zinc-800
        input: '#e4e4e7',
    },

    // Status colors
    status: {
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#dc2626',
        info: '#3b82f6',
    },

    // Avatar gradients
    avatarGradients: [
        { from: '#60a5fa', to: '#2563eb' }, // blue
        { from: '#a78bfa', to: '#7c3aed' }, // purple
        { from: '#fb923c', to: '#ea580c' }, // orange
        { from: '#34d399', to: '#059669' }, // emerald
        { from: '#f472b6', to: '#db2777' }, // pink
    ],
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
    fontFamily: {
        sans: 'var(--font-geist-sans)',
        mono: 'var(--font-geist-mono)',
    },

    fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
        sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
        base: ['1rem', { lineHeight: '1.5rem' }],     // 16px
        lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
        xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px
    },

    fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    },
} as const;

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
    none: '0px',
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '14px',
    '2xl': '18px',
    '3xl': '22px',
    full: '9999px',
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================

export const transitions = {
    duration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
    },
    timing: {
        default: 'cubic-bezier(0.4, 0, 0.2, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
} as const;

// =============================================================================
// COMPONENT SIZES
// =============================================================================

export const componentSizes = {
    button: {
        sm: { height: '32px', padding: '0 12px' },
        default: { height: '36px', padding: '0 16px' },
        lg: { height: '40px', padding: '0 24px' },
        xl: { height: '48px', padding: '0 24px' },
    },
    input: {
        default: { height: '36px' },
        lg: { height: '48px' },
    },
    avatar: {
        sm: { size: '32px' },
        default: { size: '40px' },
        lg: { size: '48px' },
        xl: { size: '64px' },
    },
    icon: {
        sm: { size: '16px' },
        default: { size: '20px' },
        lg: { size: '24px' },
        xl: { size: '32px' },
    },
} as const;

// =============================================================================
// Z-INDEX
// =============================================================================

export const zIndex = {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modalBackdrop: 40,
    modal: 50,
    popover: 60,
    tooltip: 70,
} as const;

// =============================================================================
// BREAKPOINTS
// =============================================================================

export const breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
} as const;

// =============================================================================
// TAILWIND CLASS PRESETS
// =============================================================================

/**
 * Common Tailwind class combinations for consistent styling.
 * Use these with the `cn()` utility function.
 */
export const classPresets = {
    // Buttons
    buttonPrimary: 'bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-lg transition-all duration-200 active:scale-[0.98]',
    buttonSecondary: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium rounded-lg transition-all',
    buttonOutline: 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 font-medium rounded-lg transition-all',
    buttonGhost: 'hover:bg-zinc-100 text-zinc-900 font-medium rounded-lg transition-all',

    // Inputs
    inputDefault: 'h-12 bg-white border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all',
    inputWithIcon: 'pl-10 h-12 bg-white border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all',
    inputIcon: 'absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400',

    // Cards
    cardDefault: 'bg-white rounded-xl border border-zinc-200 shadow-sm',
    cardDark: 'bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl',

    // Text
    textHeading: 'font-bold text-foreground',
    textBody: 'text-sm text-muted-foreground',
    textMuted: 'text-sm text-zinc-400',

    // Layout
    centerFlex: 'flex items-center justify-center',
    splitScreen: 'flex min-h-screen',

    // Decorative
    glassmorphism: 'bg-white/80 backdrop-blur-md',
    glassmorphismDark: 'bg-zinc-900/80 backdrop-blur-sm',
} as const;

// =============================================================================
// EXPORT ALL
// =============================================================================

const designTokens = {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
    transitions,
    componentSizes,
    zIndex,
    breakpoints,
    classPresets,
};

export default designTokens;
