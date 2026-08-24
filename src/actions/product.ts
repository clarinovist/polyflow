// Re-exports for backward compatibility.
// New code should import from:
//   product-queries (getProducts, getProductById, getUnits, getProductTypes, getVariants, getNextSKU)
//   product-mutations (createProduct, updateProduct, deleteProduct, deleteVariant, archiveVariant, unarchiveVariant)

export {
    getProducts,
    getProductById,
    getUnits,
    getProductTypes,
    getVariants,
    getNextSKU,
} from './product/product-queries';

export {
    createProduct,
    updateProduct,
    deleteVariant,
    archiveVariant,
    unarchiveVariant,
    quickCreateProduct,
} from './product/product-mutations';
