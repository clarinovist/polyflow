export interface StockBalanceFilters {
    startDate?: string;
    endDate?: string;
    locationId?: string;
}

export interface StockBalanceRow {
    productVariantId: string;
    skuCode: string;
    name: string;
    unit: string;
    openingStock: number;
    totalIn: number;
    totalOut: number;
    closingStock: number;
}

export interface StockBalanceData {
    startDate: string;
    endDate: string;
    locationId: string;
    locations: { id: string; name: string }[];
    rows: StockBalanceRow[];
}
