import {
  Customer,
  Location,
  ProductVariant,
  Product,
  SalesOrder,
  SalesOrderItem,
  Invoice,
  ProductionOrder,
  StockMovement,
} from "@prisma/client";

export type SerializedCustomer = Omit<
  Customer,
  "creditLimit" | "discountPercent"
> & {
  creditLimit: number | null;
  discountPercent: number | null;
};

// Helper type for client-side usage where Decimals are converted to numbers
export type SerializedProductVariant = Omit<
  ProductVariant,
  | "price"
  | "buyPrice"
  | "sellPrice"
  | "conversionFactor"
  | "minStockAlert"
  | "reorderPoint"
  | "reorderQuantity"
  | "standardCost"
> & {
  price: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  conversionFactor: number;
  minStockAlert: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  standardCost: number | null;
  customerPrices?: {
    customerId: string;
    unitPrice: number;
    isActive: boolean;
  }[];
  product: Product;
  inventories: {
    locationId: string;
    quantity: number;
  }[];
};

export interface SalesOrderFormProps {
  customers: SerializedCustomer[];
  locations: Location[];
  products: SerializedProductVariant[];
  mode: "create" | "edit";
  /** Lock orderType to a specific value (from intent picker). Disables the select. */
  lockedOrderType?: "MAKE_TO_STOCK" | "MAKE_TO_ORDER" | "MAKLON_JASA";
  initialData?: { id: string } & Record<string, unknown>;
  reorderData?: {
    customerId: string;
    sourceLocationId: string;
    orderType: string;
    notes: string;
    shippingCost: number;
    items: {
      productVariantId: string;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
      taxPercent: number;
    }[];
  };
}

// ---- Detail page types ----

export type SerializedSalesOrderItem = Omit<
  SalesOrderItem,
  | "quantity"
  | "unitPrice"
  | "subtotal"
  | "deliveredQty"
  | "createdAt"
  | "updatedAt"
> & {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  deliveredQty: number;
  enteredQuantity?: number | null;
  enteredUnit?: string | null;
  conversionFactorSnapshot?: number | null;
  enteredUnitPrice?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  productVariant: Omit<
    ProductVariant,
    | "price"
    | "buyPrice"
    | "sellPrice"
    | "conversionFactor"
    | "minStockAlert"
    | "reorderPoint"
    | "reorderQuantity"
    | "costingMethod"
    | "standardCost"
    | "createdAt"
    | "updatedAt"
  > & {
    conversionFactor: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    product: Product;
  };
};

export type SerializedStockMovement = Omit<
  StockMovement,
  "quantity" | "cost" | "createdAt"
> & {
  quantity: number;
  cost: number | null;
  createdAt: Date | string;
};

export type SerializedProductionOrder = Omit<
  ProductionOrder,
  | "plannedQuantity"
  | "actualQuantity"
  | "plannedStartDate"
  | "plannedEndDate"
  | "actualStartDate"
  | "actualEndDate"
  | "createdAt"
  | "updatedAt"
> & {
  plannedQuantity: number;
  actualQuantity: number | null;
  plannedStartDate: Date | string;
  plannedEndDate: Date | string | null;
  actualStartDate: Date | string | null;
  actualEndDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type SerializedSalesOrder = Omit<
  SalesOrder,
  "totalAmount" | "orderDate" | "expectedDate" | "createdAt" | "updatedAt"
> & {
  totalAmount: number | null;
  orderDate: Date | string;
  expectedDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  items: SerializedSalesOrderItem[];
  customer:
    | (Omit<
        Customer,
        "creditLimit" | "discountPercent" | "createdAt" | "updatedAt"
      > & {
        creditLimit: number | null;
        discountPercent: number | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      })
    | null;
  sourceLocation: Location | null;
  invoices: (Omit<
    Invoice,
    | "totalAmount"
    | "paidAmount"
    | "invoiceDate"
    | "dueDate"
    | "createdAt"
    | "updatedAt"
  > & {
    totalAmount: number;
    paidAmount: number;
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  })[];
  productionOrders: SerializedProductionOrder[];
  movements: SerializedStockMovement[];
  deliveryOrders?: Array<{
    id: string;
    status: string;
    totalCharge: number | null;
    orderNumber?: string;
  }>;
  createdBy: { name: string } | null;
};

export interface SalesOrderDetailClientProps {
  order: SerializedSalesOrder;
  basePath?: string;
  warehouseMode?: boolean;
  currentUserRole?: string;
}
