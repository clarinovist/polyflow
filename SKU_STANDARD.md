# SKU Standard - PolyFlow ERP

## 📋 SKU Format Standard

### **Format Structure**
```
[TYPE][CATEGORY][SEQUENCE]
```

**Total Length**: 8 characters (compact, scannable, human-readable)

---

## 🏗️ Format Components

### 1. **Type Code** (2 characters)
Indicates the product type in the production cycle:

| Code | Product Type | Description |
|------|-------------|-------------|
| `RM` | Raw Material | Incoming materials from suppliers |
| `IN` | Intermediate | Result of mixing/blending |
| `PK` | Packaging | Packaging materials |
| `WP` | Work in Progress | Semi-finished goods |
| `FG` | Finished Goods | Ready-to-sell products |
| `SC` | Scrap | Production waste |

### 2. **Category Code** (3 characters)
Material or product category identifier:

| Code | Category | Examples |
|------|----------|----------|
| `PPG` | PP Granules | Pure polypropylene |
| `PEG` | PE Granules | Polyethylene |
| `CLR` | Colorant | Masterbatch colors |
| `ADD` | Additive | UV stabilizers, etc. |
| `MIX` | Mixed | Blended compounds |
| `RAF` | Raffia | Raffia products |
| `FLM` | Film | Film products |
| `BAG` | Bags | Bag products |
| `WST` | Waste | General waste |

### 3. **Sequence Number** (3 digits)
Sequential identifier starting from 001:

- `001` - First variant in category
- `002` - Second variant
- `999` - Up to 999 variants per category

---

## ✅ Standard Examples

### Raw Materials
```
RMPPG001  → Pure PP Granules (Standard)
RMPPG002  → PP Granules (High Flow)
RMCLR001  → Red Colorant Masterbatch
RMCLR002  → Blue Colorant Masterbatch
RMCLR003  → Yellow Colorant Masterbatch
```

### Intermediate Products
```
INMIX001  → Red Mixed Granules
INMIX002  → Blue Mixed Granules
INMIX003  → Natural Mixed Granules
```

### Work in Progress
```
WPRAF001  → Red Raffia Jumbo Roll
WPRAF002  → Blue Raffia Jumbo Roll
WPFLM001  → Clear Film Roll
```

### Finished Goods
```
FGRAF001  → Red Raffia (5kg Bal)
FGRAF002  → Red Raffia (10kg Bal)
FGBAG001  → Rice Bag (50kg)
FGBAG002  → Fertilizer Bag (25kg)
```

### Scrap
```
SCWST001  → Red Waste
SCWST002  → Mixed Color Waste
SCWST003  → Edge Trim Waste
```

---

## 📐 Format Rules

### ✅ DO's
- Keep exactly 8 characters (no more, no less)
- Use UPPERCASE only
- No hyphens, spaces, or special characters
- Sequential numbering (001, 002, 003...)
- Logical category grouping

### ❌ DON'Ts
- Don't use variable length (e.g., RM-PP-PURE-STANDARD-2024)
- Don't use lowercase or mixed case
- Don't use special characters (@, #, -, _)
- Don't embed color/size in SKU (use attributes instead)
- Don't use random numbers

---

## 🔄 Migration from Old Format

### Old Format → New Format Mapping

| Old SKU | New SKU | Notes |
|---------|---------|-------|
| `RM-PP-PURE` | `RMPPG001` | Pure PP Granules |
| `RM-COLOR-RED` | `RMCLR001` | Red Colorant |
| `INT-MIX-RED` | `INMIX001` | Red Mixed Granules |
| `WIP-ROLL-RED` | `WPRAF001` | Red Raffia Roll |
| `FG-RAF-RED-BAL10` | `FGRAF001` | Red Raffia 5kg Bal |
| `SCRAP-RED` | `SCWST001` | Red Waste |

### Migration Strategy
1. Generate new SKU codes following the standard
2. Update database with new SKU codes
3. Maintain old SKU mapping for legacy reference
4. Print barcode labels with new SKU codes
5. Update all documentation

---

## 🏭 Category Code Reference

### Recommended Category Codes for Plastic Converting

#### Raw Materials
- `PPG` - Polypropylene Granules
- `PEG` - Polyethylene Granules (HDPE, LDPE, LLDPE)
- `PSG` - Polystyrene Granules
- `PVC` - PVC Resin
- `CLR` - Colorant (Masterbatch)
- `ADD` - Additives (UV, Anti-static, etc.)
- `FIL` - Fillers (CaCO3, Talc)
- `STB` - Stabilizers

#### Intermediate
- `MIX` - Mixed Compounds (result of mixing)
- `GRN` - Granulated material
- `FLK` - Flakes (from recycling)

#### Work in Progress
- `RAF` - Raffia (tape/yarn)
- `FLM` - Film
- `SHT` - Sheet
- `TUB` - Tube/Pipe
- `ROL` - Roll (jumbo)

#### Finished Goods
- `RAF` - Raffia products (bales, rolls)
- `BAG` - Bags (woven, shopping, etc.)
- `NET` - Netting
- `ROE` - Rope
- `TAR` - Tarpaulin
- `SHE` - Sheeting

#### Scrap
- `WST` - General waste
- `TRM` - Trim/Edge waste
- `REJ` - Rejected products
- `RGR` - Regrind (for recycling)

---

## 🔢 Sequence Number Guidelines

### Assignment Strategy
- Start at 001 for each new category
- Increment sequentially (001, 002, 003...)
- Don't skip numbers (avoid gaps)
- Reserve ranges for variants:
  - 001-099: Standard products
  - 100-199: Premium/special variants
  - 200-299: Custom/OEM products
  - 900-999: Obsolete/discontinued (keep for history)

### Example Sequence
```
FGRAF001  → Red Raffia 5kg
FGRAF002  → Red Raffia 10kg
FGRAF003  → Blue Raffia 5kg
FGRAF004  → Blue Raffia 10kg
FGRAF005  → Natural Raffia 5kg
...
FGRAF101  → Premium Red Raffia 5kg (UV resistant)
FGRAF102  → Premium Blue Raffia 5kg (UV resistant)
...
FGRAF201  → Custom OEM Raffia (Client A)
FGRAF202  → Custom OEM Raffia (Client B)
```

---

## 📊 Benefits of This Standard

### ✅ Advantages
1. **Fixed Length** - Easy to print on labels (no overflow)
2. **Compact** - Only 8 characters (vs. 15+ in old format)
3. **Scannable** - Barcode-friendly (no special characters)
4. **Hierarchical** - Type → Category → Sequence (logical grouping)
5. **Scalable** - Up to 999 variants per category
6. **Human-Readable** - Easy to remember and communicate
7. **Industry Standard** - Similar to SAP, Oracle, Odoo formats
8. **Database-Friendly** - Fast indexing and searching

### 📈 Comparison

| Aspect | Old Format | New Format |
|--------|-----------|------------|
| Length | Variable (10-17) | Fixed (8) |
| Example | `FG-RAF-RED-BAL10` | `FGRAF001` |
| Hyphens | Yes | No |
| Barcode | Longer code | Compact |
| Readability | Descriptive | Coded |
| Scalability | Limited | High (999 per category) |

---

## 🚀 Implementation Checklist

### Phase 1: Setup
- [x] Define SKU format standard
- [ ] Update database seed with new SKU codes
- [ ] Document category codes
- [ ] Train team on new format

### Phase 2: Database
- [ ] Add validation rule (8 chars, uppercase, alphanumeric)
- [ ] Update existing SKU codes (migration script)
- [ ] Test all queries with new format

### Phase 3: UI/UX
- [ ] Update product forms with SKU format helper
- [ ] Add SKU format validation in frontend
- [ ] Display format example in create form
- [ ] Add SKU generator utility (auto-increment)

### Phase 4: Integration
- [ ] Generate barcode labels with new SKU
- [ ] Update reports and exports
- [ ] Update API documentation
- [ ] Print barcode labels for existing inventory

---

## 🔧 Validation Rules

### Regex Pattern
```regex
^(RM|IN|PK|WP|FG|SC)[A-Z]{3}\d{3}$
```

**Explanation**:
- `^` - Start of string
- `(RM|IN|PK|WP|FG|SC)` - Valid type codes
- `[A-Z]{3}` - Exactly 3 uppercase letters (category)
- `\d{3}` - Exactly 3 digits (sequence)
- `$` - End of string

### Validation Examples
```
✅ RMPPG001  → Valid
✅ FGRAF123  → Valid
✅ SCWST999  → Valid

❌ rmppg001  → Invalid (lowercase)
❌ RM-PPG-001 → Invalid (hyphens)
❌ RMPPG1    → Invalid (wrong length)
❌ RMPPG1234 → Invalid (too long)
❌ XXPPG001  → Invalid (invalid type code)
```

---

## 📖 Usage in Code

### TypeScript Validation
```typescript
import { z } from 'zod';

const skuCodeSchema = z.string()
  .length(8, 'SKU must be exactly 8 characters')
  .regex(/^(RM|IN|PK|WP|FG|SC)[A-Z]{3}\d{3}$/, 
    'SKU format: [TYPE][CATEGORY][SEQUENCE] (e.g., RMPPG001)')
  .toUpperCase();
```

### Auto-Generate Next SKU
```typescript
async function generateNextSKU(type: string, category: string): Promise<string> {
  const prefix = `${type}${category}`;
  
  // Find highest sequence number for this prefix
  const lastSKU = await prisma.productVariant.findFirst({
    where: {
      skuCode: {
        startsWith: prefix
      }
    },
    orderBy: {
      skuCode: 'desc'
    }
  });
  
  if (!lastSKU) {
    return `${prefix}001`;
  }
  
  const lastSeq = parseInt(lastSKU.skuCode.slice(-3));
  const nextSeq = (lastSeq + 1).toString().padStart(3, '0');
  
  return `${prefix}${nextSeq}`;
}

// Usage
const newSKU = await generateNextSKU('RM', 'PPG'); // Returns: RMPPG001, RMPPG002, etc.
```

---

## 🎯 Quick Reference Card

### SKU Format Cheat Sheet
```
┌─────────────────────────────────────┐
│   PolyFlow SKU Format Standard      │
├─────────────────────────────────────┤
│                                     │
│   [TYPE][CATEGORY][SEQUENCE]        │
│   └─2─┘ └───3───┘ └───3───┘        │
│                                     │
│   Total: 8 characters               │
│                                     │
│   Example: RMPPG001                 │
│            └─ Pure PP Granules #1   │
│                                     │
│   Type Codes:                       │
│   RM = Raw Material                 │
│   IN = Intermediate                 │
│   PK = Packaging                    │
│   WP = Work in Progress             │
│   FG = Finished Goods               │
│   SC = Scrap                        │
│                                     │
│   Rules:                            │
│   • UPPERCASE only                  │
│   • No hyphens/spaces               │
│   • Fixed 8 chars                   │
│   • Sequential 001-999              │
│                                     │
└─────────────────────────────────────┘
```

---

**Last Updated**: January 4, 2026

**Version**: 1.0

**Status**: ✅ Standard Approved - Ready for Implementation
