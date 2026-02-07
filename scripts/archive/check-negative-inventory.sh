#!/usr/bin/env bash
# Usage: ./scripts/check-negative-inventory.sh [location_slug]
# Example: ./scripts/check-negative-inventory.sh mixing_area

LOCATION_SLUG=${1:-mixing_area}
CONTAINER=${POLYFLOW_DB_CONTAINER:-polyflow-db}

echo "Checking negative inventory for location slug = $LOCATION_SLUG"

docker exec -i $CONTAINER psql -U polyflow -d polyflow -p 5434 -c "SELECT i.\"id\", i.\"locationId\", l.\"slug\" as location_slug, l.\"name\" as location_name, i.\"productVariantId\", pv.\"skuCode\", pv.\"name\" as variant_name, i.\"quantity\"::numeric AS quantity FROM \"Inventory\" i JOIN \"Location\" l ON l.\"id\" = i.\"locationId\" JOIN \"ProductVariant\" pv ON pv.\"id\" = i.\"productVariantId\" WHERE i.\"quantity\" < 0 AND l.\"slug\" = '$LOCATION_SLUG';"
