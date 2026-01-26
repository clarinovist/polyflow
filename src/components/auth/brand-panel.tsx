'use client';

import { useTranslations } from 'next-intl';
import PolyFlowLogo from './polyflow-logo';

export default function BrandPanel() {
    const t = useTranslations('auth.brand');

    return (
        <div className="hidden lg:flex lg:w-1/2 bg-zinc-950 relative overflow-hidden flex-col justify-between p-10">
            {/* Decorative 3D Logo Background - positioned top-right */}
            <div className="absolute -top-10 -right-20 pointer-events-none opacity-15">
                <div className="relative w-[350px] h-[350px]">
                    {/* Layer 1 - Back */}
                    <div className="absolute inset-0 transform translate-x-6 translate-y-6">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#4a4a4a"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                    {/* Layer 2 - Middle */}
                    <div className="absolute inset-0 transform translate-x-3 translate-y-3">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#555555"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                    {/* Layer 3 - Front */}
                    <div className="absolute inset-0">
                        <svg viewBox="0 0 200 200" className="w-full h-full">
                            <path
                                d="M60 30V170M60 30H120C140 30 156 46 156 66V66C156 86 140 102 120 102H60"
                                stroke="#666666"
                                strokeWidth="16"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="none"
                            />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Accent triangle - positioned separately */}
            <div className="absolute top-20 right-10 w-24 h-24 opacity-30 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                    <polygon
                        points="50,10 90,90 10,90"
                        fill="none"
                        stroke="#555"
                        strokeWidth="2"
                    />
                </svg>
            </div>

            {/* Decorative diagonal lines */}
            <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none">
                <svg viewBox="0 0 100 100" className="w-full h-full opacity-20">
                    <line x1="20" y1="0" x2="100" y2="80" stroke="#555" strokeWidth="0.5" />
                    <line x1="40" y1="0" x2="100" y2="60" stroke="#555" strokeWidth="0.5" />
                    <line x1="60" y1="0" x2="100" y2="40" stroke="#555" strokeWidth="0.5" />
                </svg>
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto">
                {/* Brand Header */}
                <div className="mb-6">
                    <PolyFlowLogo variant="light" size="sm" showText={false} />
                    <p className="text-zinc-400 text-sm mt-2">{t('polyFlow')}</p>
                </div>

                {/* Welcome Text */}
                <h1 className="text-4xl font-bold text-white mb-4">
                    {t('welcome')}
                </h1>
                <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                    {t('description')}
                </p>
                <p className="text-zinc-500 text-sm">
                    {t('socialProof', { count: '1K' })}
                </p>

                {/* Feature Card */}
                <div className="mt-10 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6">
                    <h3 className="text-white font-semibold text-lg mb-2">
                        {t('cta')}
                    </h3>
                    <div className="flex items-center justify-between">
                        <p className="text-zinc-400 text-sm max-w-[200px]">
                            {t('ctaSub')}
                        </p>
                        {/* Avatar Stack */}
                        <div className="flex -space-x-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-zinc-900 flex items-center justify-center text-white text-xs font-medium">
                                JD
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-zinc-900 flex items-center justify-center text-white text-xs font-medium">
                                AK
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 border-2 border-zinc-900 flex items-center justify-center text-white text-xs font-medium">
                                MR
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-zinc-900 flex items-center justify-center text-white text-xs font-medium">
                                +5
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
