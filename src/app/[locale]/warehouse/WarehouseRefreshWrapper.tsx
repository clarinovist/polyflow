'use client';

import { useState, useEffect } from 'react';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import WarehouseOrderCard from '@/components/warehouse/WarehouseOrderCard';

import { Location, Employee as PrismaEmployee, ProductVariant, Machine, WorkShift } from '@prisma/client';

interface WarehouseRefreshWrapperProps {
    initialOrders: ExtendedProductionOrder[];
    refreshData: () => Promise<void>;
    formData: {
        locations: Location[];
        operators: PrismaEmployee[];
        helpers: PrismaEmployee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    };
    sessionUser?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        role?: string;
    };
}

export default function WarehouseRefreshWrapper({
    initialOrders,
    refreshData,
    formData,
    sessionUser
}: WarehouseRefreshWrapperProps) {
    const t = useTranslations('warehouse');
    const [searchQuery, setSearchQuery] = useState('');

    // Auto-refresh logic (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            refreshData();
        }, 30000);
        return () => clearInterval(interval);
    }, [refreshData]);

    const filteredOrders = initialOrders.filter(order => {
        const matchesSearch =
            order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.bom.productVariant.product.name.toLowerCase().includes(searchQuery.toLowerCase());

        // We only show orders that have RELEASED or IN_PROGRESS status
        // And potentially filter out those that are "Material Complete" if we want
        return matchesSearch;
    });

    // Removed manual login gate - now using session

    // --- Main Content UI ---
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
            {/* Action Bar */}
            <div className="bg-white border-b px-4 py-3 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-10 h-10 shadow-inner bg-slate-50/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="flex items-center gap-3 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {sessionUser?.name?.charAt(0) || 'U'}
                        </div>
                        <span className="text-xs font-bold text-blue-800">{sessionUser?.name || 'User'}</span>
                    </div>
                </div>
            </div>

            {/* Orders Feed */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-4 bg-orange-500 rounded-full" />
                            {t('releasedOrdersQueue')}
                        </h2>
                        <span className="text-xs font-medium text-slate-400">{t('ordersFound', { count: filteredOrders.length })}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {filteredOrders.map(order => (
                            <WarehouseOrderCard
                                key={order.id}
                                order={order}
                                locations={formData.locations}
                                rawMaterials={formData.rawMaterials}
                            />
                        ))}

                        {filteredOrders.length === 0 && (
                            <Card className="border-dashed bg-transparent">
                                <CardContent className="py-20 text-center">
                                    <p className="text-slate-400 italic">{t('noOrders')}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
