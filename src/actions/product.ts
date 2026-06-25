// Re-exports for backward compatibility.
// New code should import from:
//   product-queries (getProducts, getProductById, getUnits, getProductTypes, getVariants, getNextSKU)
//   product-mutations (createProduct, updateProduct, deleteProduct, deleteVariant)

export {
  getProducts,
  getProductById,
  getUnits,
  getProductTypes,
  getVariants,
  getNextSKU,
  type ProductWithVariantsAndStock,
} from "./product/product-queries";

export {
  createProduct,
  updateProduct,
  deleteProduct,
  deleteVariant,
} from "./product/product-mutations";
