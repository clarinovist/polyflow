-- Ukuran 1 kontainer fisik (zak/karung/roll) per SKU, dalam primaryUnit.
-- Nullable/opt-in: NULL = tidak ada pembulatan transfer (perilaku lama).
ALTER TABLE "ProductVariant" ADD COLUMN "packagingContainerSize" DECIMAL(15,4);
