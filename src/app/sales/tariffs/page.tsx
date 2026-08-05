import { getAllVehicleTariffs } from '@/actions/sales/vehicle-tariffs';
import { getCustomers } from '@/actions/sales/customer';
import { getVehicles } from '@/actions/sales/vehicles';
import { TariffListClient } from '@/components/sales/TariffListClient';
import { salesLabels } from '@/lib/labels';
import { serializeData } from '@/lib/utils/utils';
import { Receipt } from 'lucide-react';

export default async function TariffsPage() {
    const [tariffsRes, customersRes, vehiclesRes] = await Promise.all([
        getAllVehicleTariffs(),
        getCustomers(),
        getVehicles({ status: 'ACTIVE' }),
    ]);

    const tariffs =
        tariffsRes.success && tariffsRes.data
            ? serializeData(tariffsRes.data)
            : [];

    const customers =
        customersRes.success && customersRes.data
            ? (customersRes.data as Array<{
                  id: string;
                  name: string;
                  code?: string | null;
              }>).map((c) => ({ id: c.id, name: c.name, code: c.code }))
            : [];

    const vehicles =
        vehiclesRes.success && vehiclesRes.data
            ? (vehiclesRes.data as Array<{
                  id: string;
                  plateNumber: string;
                  name: string;
              }>).map((v) => ({
                  id: v.id,
                  plateNumber: v.plateNumber,
                  name: v.name,
              }))
            : [];

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <Receipt className="h-8 w-8 text-green-600" />
                    {salesLabels.tariffs}
                </h1>
                <p className="text-muted-foreground">
                    Daftar semua tarif pengiriman lintas armada dan customer.
                </p>
            </div>

            <TariffListClient
                tariffs={tariffs}
                customers={customers}
                vehicles={vehicles}
            />
        </div>
    );
}
