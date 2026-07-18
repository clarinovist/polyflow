'use client';

import PolyFlowLogo from './polyflow-logo';
import BrandDecoration from './brand-decoration';
import { brandPanelLabels as L } from '@/lib/labels/auth';

export default function BrandPanel({ subdomain }: { subdomain?: string | null }) {

    return (
        <div className="hidden lg:flex lg:w-1/2 bg-zinc-950 relative overflow-hidden flex-col justify-between p-10">
            <BrandDecoration />

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md mx-auto">
                {/* Brand Header */}
                <div className="mb-6">
                    <PolyFlowLogo variant="light" size="sm" showText={false} />
                    <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-2">PolyFlow</p>
                </div>

                {/* Welcome Text */}
                <h1 className="text-4xl font-bold text-white mb-4">
                    {subdomain ? `${L.welcomeTo} ${subdomain.toUpperCase()}` : `${L.welcomeTo} PolyFlow`}
                </h1>
                <p className="text-zinc-400 dark:text-zinc-500 text-sm leading-relaxed mb-4">
                    {subdomain ?
                        L.signInDescription :
                        L.brandDescription
                    }
                </p>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                    {subdomain ? L.enterprisePortal : L.joinUs}
                </p>

                {/* Feature Card */}
                <div className="mt-10 bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6">
                    <h3 className="text-white font-semibold text-lg mb-2">
                        {L.streamlineTitle}
                    </h3>
                    <div className="flex items-center justify-between">
                        <p className="text-zinc-400 dark:text-zinc-500 text-sm max-w-[200px]">
                            {L.streamlineDescription}
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
