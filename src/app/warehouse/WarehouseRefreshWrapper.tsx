'use client';

import { useState, useEffect } from 'react';
import { Employee } from '@prisma/client';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Users, LogIn, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import PolyFlowLogo from '@/components/auth/polyflow-logo';
import WarehouseOrderCard from '@/components/warehouse/WarehouseOrderCard';

import { Location, Employee as PrismaEmployee, ProductVariant, Machine, WorkShift } from '@prisma/client';

interface WarehouseRefreshWrapperProps {
    initialOrders: ExtendedProductionOrder[];
    employees: Employee[];
    refreshData: () => Promise<void>;
    formData: {
        locations: Location[];
        operators: PrismaEmployee[];
        helpers: PrismaEmployee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    };
}

export default function WarehouseRefreshWrapper({
    initialOrders,
    employees,
    refreshData,
    formData
}: WarehouseRefreshWrapperProps) {
    const [warehouseOperator, setWarehouseOperator] = useState<Employee | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter employees to show only relevant ones (e.g. WAREHOUSE or PRODUCTION roles if available)
    // For now, show all but could be filtered by department
    const filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Persistence logic
    useEffect(() => {
        const saved = localStorage.getItem('warehouse_operator');
        if (saved) {
            try {
                const operator = JSON.parse(saved);
                setTimeout(() => setWarehouseOperator(operator), 0);
            } catch (e) {
                console.error("Failed to parse warehouse operator", e);
            }
        }
    }, []);

    const handleSelectOperator = (emp: Employee) => {
        setWarehouseOperator(emp);
        localStorage.setItem('warehouse_operator', JSON.stringify(emp));
        setSearchQuery('');
    };

    const handleLogout = () => {
        setWarehouseOperator(null);
        localStorage.removeItem('warehouse_operator');
    };

    // Auto-refresh logic (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            if (warehouseOperator) {
                refreshData();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [warehouseOperator, refreshData]);

    const filteredOrders = initialOrders.filter(order => {
        const matchesSearch =
            order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.bom.productVariant.product.name.toLowerCase().includes(searchQuery.toLowerCase());

        // We only show orders that have RELEASED or IN_PROGRESS status
        // And potentially filter out those that are "Material Complete" if we want
        return matchesSearch;
    });

    // --- Login Gate UI ---
    if (!warehouseOperator) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <PolyFlowLogo className="mx-auto w-16 h-16 mb-4" />
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-outfit uppercase">Warehouse Access</h2>
                        <p className="text-slate-500 mt-2">Select staff to manage material issuance</p>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Find staff name..."
                            className="pl-10 h-12 text-lg shadow-sm border-slate-200"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredEmployees.map((emp) => (
                            <Button
                                key={emp.id}
                                variant="outline"
                                className="h-16 justify-between px-6 hover:border-blue-500 hover:bg-blue-50/50 group transition-all"
                                onClick={() => handleSelectOperator(emp)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-slate-900 group-hover:text-blue-700">{emp.name}</p>
                                        <p className="text-xs text-slate-500">{emp.code}</p>
                                    </div>
                                </div>
                                <LogIn className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // --- Main Content UI ---
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
            {/* Action Bar */}
            <div className="bg-white border-b px-4 py-3 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search SPK or Product..."
                        className="pl-10 h-10 shadow-inner bg-slate-50/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="flex items-center gap-3 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {warehouseOperator.name.charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-blue-800">{warehouseOperator.name}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full hover:bg-red-50 hover:text-red-500 text-blue-400"
                            onClick={handleLogout}
                            title="Switch Staff"
                        >
                            <ChevronRight className="w-4 h-4 rotate-180" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Orders Feed */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-5xl mx-auto">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-4 bg-orange-500 rounded-full" />
                            Released Orders Queue
                        </h2>
                        <span className="text-xs font-medium text-slate-400">{filteredOrders.length} orders found</span>
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
                                    <p className="text-slate-400 italic">No orders matching search or requiring immediate fulfillment.</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
