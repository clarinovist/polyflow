/* eslint-disable */
const fs = require('fs');
const path = 'src/services/inventory/__tests__/stock-ledger-service.test.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/product:\s*\{\s*productType:\s*'RAW_MATERIAL'\s*\}\n\s*\}\);/g, "product: { productType: 'RAW_MATERIAL' }\n        } as any);");
fs.writeFileSync(path, content);
