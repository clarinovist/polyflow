export type RouteType = {
    id: string;
    code: string;
    name: string;
    version: number;
    status: string;
    isDefault: boolean;
    productVariantId: string;
    productVariant?: {
        skuCode: string;
        name: string;
        product?: { name: string };
    };
    steps: Array<{
        id: string;
        sequence: number;
        stepCode: string;
        label: string;
        processId: string;
        process: {
            id: string;
            code: string;
            name: string;
            requiresMachine: boolean;
        };
        bomId: string;
        bom: {
            id: string;
            name: string;
            productVariantId: string;
            productVariant?: {
                skuCode?: string;
                name?: string;
                product?: { name?: string };
            };
            outputQuantity?: number | string;
        };
        materialSourceLocationId: string | null;
        outputLocationId: string | null;
        materialSourceLocation?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        outputLocation?: { id: string; name: string; slug: string } | null;
        requiresQualityGate: boolean;
        allowsPartialHandoff: boolean;
    }>;
};

export type NewStepForm = {
    stepCode: string;
    label: string;
    processId: string;
    bomId: string;
    materialSourceLocationId: string;
    outputLocationId: string;
    allowsPartialHandoff: boolean;
    requiresQualityGate: boolean;
};

export type Option = {
    id: string;
    name: string;
    code?: string;
    skuCode?: string;
    slug?: string;
    subtitle?: string;
    isChainMatch?: boolean;
};

export type ValidationIssue = {
    code: string;
    severity: string;
    message: string;
    stepCode?: string;
    field?: string;
};
