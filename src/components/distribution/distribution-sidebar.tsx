'use client';

import {
    LayoutDashboard,
    ShoppingCart,
    Truck,
    Package,
    Warehouse,
    Receipt,
} from 'lucide-react';
import { PortalSidebarBase } from '@/components/layout/portal-sidebar-base';
import { PortalNavGroup } from '@/components/layout/portal-nav-item';
import { AdminBackButton } from '@/components/layout/admin-back-button';
import { filterNavGroups } from '@/lib/auth/permission-match';

interface DistributionSidebarProps {
    user: {
        name?: string | null;
        email?: string | null;
        role?: string | null;
        image?: string | null;
    };
    permissions?: string[] | 'ALL';
}

// Fase 1: hub + alias ke modul existing (SO, PO, stok, invoice).
// Item fitur distributor sendiri menyusul setelah discovery (Fase 2).
const distributionLinks = [
    {
        heading: 'Ringkasan',
        items: [
            {
                href: '/distribution',
                icon: LayoutDashboard,
                label: 'Papan Distributor',
                exact: true,
            },
        ],
    },
    {
        heading: 'Transaksi',
        items: [
            {
                href: '/sales/orders',
                icon: ShoppingCart,
                label: 'Sales Order',
            },
            {
                href: '/purchasing/orders',
                icon: Package,
                label: 'Order Pembelian (PO)',
            },
        ],
    },
    {
        heading: 'Pengiriman & Stok',
        items: [
            {
                href: '/sales/deliveries',
                icon: Truck,
                label: 'Surat Jalan',
            },
            {
                href: '/warehouse/inventory',
                icon: Warehouse,
                label: 'Stok',
            },
        ],
    },
    {
        heading: 'Pelaporan',
        items: [
            {
                href: '/sales/invoices',
                icon: Receipt,
                label: 'Invoice & Piutang',
            },
        ],
    },
];

export function DistributionSidebar({
    user,
    permissions,
}: DistributionSidebarProps) {
    const filteredGroups = filterNavGroups(distributionLinks, permissions);
    return (
        <PortalSidebarBase
            user={user}
            portalName="Distributor"
            accentColor="blue"
        >
            <div className="px-3 mb-2">
                <AdminBackButton />
            </div>
            {filteredGroups.map((group) => (
                <PortalNavGroup
                    key={group.heading}
                    heading={group.heading}
                    items={group.items}
                    accentColor="blue"
                />
            ))}
        </PortalSidebarBase>
    );
}
