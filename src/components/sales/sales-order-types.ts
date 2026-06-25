import { Customer, Location, ProductVariant, Product } from "@prisma/client";

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
  initialData?: { id: string } & Record<string, unknown>;
}
