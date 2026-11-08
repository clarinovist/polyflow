import { Prisma } from '@prisma/client';

/**
 * Where an inventory movement journal took its unit cost from. Kept explicit so
 * callers/reports can tell a persisted cost from a by-product zero.
 */
type OutboundCostSource =
    | 'MOVEMENT'
    | 'STANDARD_COST'
    | 'BUY_PRICE'
    | 'LOCATION_WAC'
    | 'ZERO';

type Decimalish = Prisma.Decimal | null | undefined;

export interface OutboundCostBasis {
    cost: Prisma.Decimal;
    source: OutboundCostSource;
}

/**
 * Resolve the unit cost used to value an inventory movement journal.
 *
 * A selling price is never a cost. The chain is persisted movement cost →
 * SKU standard cost → buy price → source-location WAC → explicit zero. The
 * master `price`/`sellPrice` deliberately never appears here: outbound stock
 * must be relieved at the basis that capitalized it, otherwise COGS/inventory
 * credits are invented and the GL balance guard blocks the shipment.
 *
 * A null location WAC means "unknown"; ZERO is a deliberate by-product value
 * (affal is fully absorbed by the good output), not a fallback guess.
 */
export function resolveOutboundCostBasis(input: {
    movementCost: Decimalish;
    standardCost: Decimalish;
    buyPrice: Decimalish;
    locationWac?: Decimalish;
}): OutboundCostBasis {
    if (input.movementCost != null) {
        return { cost: input.movementCost, source: 'MOVEMENT' };
    }
    if (input.standardCost != null) {
        return { cost: input.standardCost, source: 'STANDARD_COST' };
    }
    if (input.buyPrice != null) {
        return { cost: input.buyPrice, source: 'BUY_PRICE' };
    }
    if (input.locationWac != null) {
        return { cost: input.locationWac, source: 'LOCATION_WAC' };
    }
    return { cost: new Prisma.Decimal(0), source: 'ZERO' };
}
