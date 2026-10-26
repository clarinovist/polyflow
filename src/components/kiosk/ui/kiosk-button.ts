import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Kiosk control classes for a <button> or <Link>. Every size is at least 48px
 * tall so it works with gloved hands; colors come from the kiosk theme tokens.
 */
export const kioskButton = cva(
    'inline-flex items-center justify-center gap-2 rounded-xl border-2 font-bold transition-colors active:scale-[0.98] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
    {
        variants: {
            tone: {
                neutral: 'border-border bg-card text-foreground hover:bg-muted',
                go: 'border-transparent bg-kiosk-go text-kiosk-go-fg hover:bg-kiosk-go/90',
                stop: 'border-kiosk-stop bg-card text-kiosk-stop-ink hover:bg-kiosk-stop-soft',
                info: 'border-kiosk-info bg-card text-kiosk-info hover:bg-kiosk-info-soft',
                ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            },
            size: {
                md: 'min-h-12 px-4 text-base [&_svg]:size-5',
                lg: 'min-h-14 px-5 text-lg [&_svg]:size-5',
                xl: 'min-h-[72px] px-6 text-xl [&_svg]:size-6',
            },
        },
        defaultVariants: { tone: 'neutral', size: 'md' },
    },
);

export type KioskButtonVariants = VariantProps<typeof kioskButton>;
