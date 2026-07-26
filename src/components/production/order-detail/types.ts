import {
    ProductionOrder, Bom, Machine, Location, User, MaterialIssue, ScrapRecord, QualityInspection,
    ProductVariant, Employee, ProductionExecution, ProductionMaterial,
    ProductionShift, Product, ProductionIssue, Customer, SalesOrder, SalesOrderType,
    Unit, MaklonCostType
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type ExtendedProductionOrder = ProductionOrder & {
    bom: Bom & {
        productVariant: ProductVariant & {
            product: { name: string }
            primaryUnit: Unit
            salesUnit: Unit | null
            conversionFactor: Decimal
        },
        category: 'STANDARD' | 'MIXING' | 'EXTRUSION' | 'PACKING' | 'REWORK',
        items: { id: string; productVariantId: string; productVariant: ProductVariant & { product: { name: string } }; quantity: number }[]
    };
    machine: Machine | null;
    location: Location;
    shifts: (ProductionShift & { operator: Employee | null, helpers: Employee[] })[];
    materialIssues: (MaterialIssue & { productVariant: ProductVariant, createdBy: User | null })[];
    scrapRecords: (ScrapRecord & { productVariant: ProductVariant, createdBy: User | null })[];
    inspections: (QualityInspection & { inspector: User | null })[];
    executions: (ProductionExecution & { operator: Employee | null, shift: (ProductionShift & { operator: Employee | null }) | null })[];
    plannedMaterials: (ProductionMaterial & { productVariant: ProductVariant & { product: Product } })[];
    childOrders: (ProductionOrder & { bom: Bom & { productVariant: { name: string, id: string } } })[];
    parentOrder: ProductionOrder | null;
    issues?: (ProductionIssue & { reportedBy: { id: string; name: string | null } | null })[];
    isMaklon?: boolean;
    maklonCustomer?: Customer | null;
    estimatedConversionCost?: number;
    maklonCostItems?: {
        id: string;
        costType: MaklonCostType;
        description: string | null;
        amount: string | number;
    }[];
    salesOrder?: Pick<SalesOrder, 'id' | 'orderNumber'> & {
        orderType: SalesOrderType;
        customer: Pick<Customer, 'id' | 'name' | 'email' | 'phone'> | null;
    } | null;
}
