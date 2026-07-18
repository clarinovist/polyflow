'use client';

const LOGO_PATH =
    'M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60';

const LOGO_LAYERS = [
    { translate: 'translate-x-6 translate-y-6', stroke: '#4a4a4a' },
    { translate: 'translate-x-3 translate-y-3', stroke: '#555555' },
    { translate: '', stroke: '#666666' },
] as const;

/**
 * Decorative background artwork for the auth BrandPanel:
 * a layered 3D "P" logo mark, an accent triangle, and diagonal lines.
 * Purely presentational — no props.
 */
export default function BrandDecoration() {
    return (
        <>
            {/* Layered 3D "P" logo mark — top-right */}
            <div className="absolute -top-10 -right-20 pointer-events-none opacity-15">
                <div className="relative w-[350px] h-[350px]">
                    {LOGO_LAYERS.map((layer, i) => (
                        <div key={i} className={`absolute inset-0 transform ${layer.translate}`}>
                            <svg viewBox="0 0 200 200" className="w-full h-full">
                                <path
                                    d={LOGO_PATH}
                                    stroke={layer.stroke}
                                    strokeWidth="16"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                />
                            </svg>
                        </div>
                    ))}
                </div>
            </div>

            {/* Accent triangle */}
            <div className="absolute top-20 right-10 w-24 h-24 opacity-30 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                    <polygon points="50,10 90,90 10,90" fill="none" stroke="#555" strokeWidth="2" />
                </svg>
            </div>

            {/* Diagonal lines */}
            <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full opacity-20">
                    <line x1="20" y1="0" x2="100" y2="80" stroke="#555" strokeWidth="0.5" />
                    <line x1="40" y1="0" x2="100" y2="60" stroke="#555" strokeWidth="0.5" />
                    <line x1="60" y1="0" x2="100" y2="40" stroke="#555" strokeWidth="0.5" />
                </svg>
            </div>
        </>
    );
}
