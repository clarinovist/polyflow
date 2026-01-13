'use client';

interface PolyFlowLogoProps {
    variant?: 'light' | 'dark';
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
}

export default function PolyFlowLogo({
    variant = 'dark',
    size = 'md',
    showText = true
}: PolyFlowLogoProps) {
    const sizeClasses = {
        sm: { icon: 'w-8 h-8', text: 'text-lg' },
        md: { icon: 'w-10 h-10', text: 'text-xl' },
        lg: { icon: 'w-12 h-12', text: 'text-2xl' },
    };

    const variantClasses = {
        light: {
            circle: 'fill-white',
            path: 'stroke-zinc-900',
            secondary: 'stroke-zinc-400',
            text: 'text-white'
        },
        dark: {
            circle: 'fill-foreground',
            path: 'stroke-background',
            secondary: 'stroke-muted-foreground',
            text: 'text-foreground'
        }
    };

    const colors = variantClasses[variant];
    const sizes = sizeClasses[size];

    return (
        <div className="flex items-center gap-2">
            {/* PolyFlow "P" Logo Mark */}
            <div className={`${sizes.icon} relative`}>
                <svg
                    viewBox="0 0 48 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                >
                    {/* Background circle */}
                    <circle cx="24" cy="24" r="22" className={colors.circle} />

                    {/* Stylized "P" with flow effect */}
                    <path
                        d="M18 12V36M18 12H28C32.4183 12 36 15.5817 36 20C36 24.4183 32.4183 28 28 28H18"
                        className={colors.path}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Flow accent lines */}
                    <path
                        d="M30 32C32 34 34 35 36 35"
                        className={colors.secondary}
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                    <path
                        d="M28 36C30 37 32 37.5 34 37"
                        className={colors.secondary}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.6"
                    />
                </svg>
            </div>

            {showText && (
                <span className={`font-semibold ${sizes.text} ${colors.text}`}>
                    PolyFlow
                </span>
            )}
        </div>
    );
}
