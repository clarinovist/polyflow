import {
    ProductionOrder, Bom, Machine, Location, User, MaterialIssue, ScrapRecord, QualityInspection,
    ProductVariant, Employee, WorkShift, ProductionExecution, ProductionMaterial,
    ProductionShift, Product
} from '@prisma/client';

export type ExtendedProductionOrder = ProductionOrder & {
    bom: Bom & {
        productVariant: ProductVariant & { product: { name: string } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: { id: string; productVariantId: string; productVariant: ProductVariant & { product: { name: string } }; quantity: any }[]
    };
    machine: Machine | null;
    location: Location;
    shifts: (ProductionShift & { operator: Employee | null, helpers: Employee[] })[];
    materialIssues: (MaterialIssue & { productVariant: ProductVariant, createdBy: User | null })[];
    scrapRecords: (ScrapRecord & { productVariant: ProductVariant, createdBy: User | null })[];
    inspections: (QualityInspection & { inspector: User | null })[];
    executions: (ProductionExecution & { operator: Employee | null, shift: WorkShift | null })[];
    plannedMaterials: (ProductionMaterial & { productVariant: ProductVariant & { product: Product } })[];
    childOrders: (ProductionOrder & { bom: Bom & { productVariant: { name: string, id: string } } })[];
    parentOrder: ProductionOrder | null;
}
