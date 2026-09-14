export interface Vehicle {
    id: string;
    plateNumber: string;
    name: string;
    capacityKg?: number | null;
    driverName?: string | null;
    status: string;
}

export interface StopItem {
    id: string;
    quantity: number;
    deliveredQty: number;
    enteredQuantity: number | null;
    enteredUnit: string | null;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        primaryUnit: string;
    };
}

export interface Stop {
    id: string;
    status: string;
    activityType: string;
    activityLabel: string | null;
    activityCustomer: string | null;
    plannedWeightKg: number | null;
    sequence: number;
    notes: string | null;
    deliveryOrder: {
        id: string;
        orderNumber: string;
        totalCharge: number | null;
        status: string;
        salesOrder?: {
            id: string;
            orderNumber: string;
            customer?: { id: string; name: string } | null;
            items: StopItem[];
        } | null;
    } | null;
    salesOrder?: {
        id: string;
        orderNumber: string;
        customer?: { id: string; name: string } | null;
        items: StopItem[];
    } | null;
    plannedItems?: Array<{
        id: string;
        plannedQuantity: number;
        salesOrderItem: {
            id: string;
            quantity: number;
            deliveredQty: number;
            productVariant: {
                id: string;
                name: string;
                skuCode: string;
                primaryUnit: string;
            };
        };
    }>;
}

export interface Trip {
    id: string;
    vehicleId: string | null;
    transportMode: string;
    departureDate: string | null;
    routeName: string | null;
    runNumber: string | null;
    status: string;
    notes: string | null;
    externalProvider: string | null;
    externalPlate: string | null;
    externalDriver: string | null;
    cancelReason: string | null;
    vehicle: {
        id: string;
        plateNumber: string;
        name: string;
        driverName: string | null;
        capacityKg?: number | null;
    } | null;
    orders: Stop[];
}

export interface Schedule {
    id: string;
    scheduleNumber: string;
    weekStart: string;
    weekEnd: string;
    status: string;
    notes: string | null;
    vehicles: Trip[];
    createdBy: { name: string | null } | null;
}

export interface SchedulableSO {
    id: string;
    orderNumber: string;
    customer: { id: string; name: string } | null;
    remainingQty: number;
    alreadyPlanned: boolean;
    items: StopItem[];
}
