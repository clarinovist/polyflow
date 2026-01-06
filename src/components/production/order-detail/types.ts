import {
    ProductionOrder, Bom, Machine, Location, User, MaterialIssue, ScrapRecord, QualityInspection,
    ProductVariant, Employee, WorkShift, ProductionExecution, ProductionMaterial
} from '@prisma/client';

export type ExtendedProductionOrder = ProductionOrder & {
    bom: Bom & { productVariant: ProductVariant & { product: any }, items: any[] };
    machine: Machine | null;
    location: Location;
    shifts: (any)[];
    materialIssues: (MaterialIssue & { productVariant: ProductVariant, createdBy: User | null })[];
    scrapRecords: (ScrapRecord & { productVariant: ProductVariant, createdBy: User | null })[];
    inspections: (QualityInspection & { inspector: User | null })[];
    executions: (ProductionExecution & { operator: Employee | null, shift: WorkShift | null })[];
    plannedMaterials: (ProductionMaterial & { productVariant: ProductVariant & { product: any } })[];
}
