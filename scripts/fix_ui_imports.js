const fs = require('fs');
const path = require('path');

const replacements = {
  "'@/components/ui/accounting-input'": "'@/components/finance/accounting/accounting-input'",
  "\"@/components/ui/accounting-input\"": "\"@/components/finance/accounting/accounting-input\"",
  
  "'@/components/ui/product-combobox'": "'@/components/products/product-combobox'",
  "\"@/components/ui/product-combobox\"": "\"@/components/products/product-combobox\"",
  
  "'@/components/GlobalSearch'": "'@/components/layout/GlobalSearch'",
  "\"@/components/GlobalSearch\"": "\"@/components/layout/GlobalSearch\"",
  
  "'@/components/theme-provider'": "'@/components/layout/theme-provider'",
  "\"@/components/theme-provider\"": "\"@/components/layout/theme-provider\"",
  
  "'@/components/ui/transaction-date-filter'": "'@/components/common/transaction-date-filter'",
  "\"@/components/ui/transaction-date-filter\"": "\"@/components/common/transaction-date-filter\"",
  
  "'@/components/ui/url-transaction-date-filter'": "'@/components/common/url-transaction-date-filter'",
  "\"@/components/ui/url-transaction-date-filter\"": "\"@/components/common/url-transaction-date-filter\""
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../src'));
// files.push(...walk(path.join(__dirname, '../tests')));

let changedCount = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  for (const [oldPath, newPath] of Object.entries(replacements)) {
    newContent = newContent.split(oldPath).join(newPath);
  }
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    changedCount++;
  }
}

console.log(`Updated UI imports in ${changedCount} files.`);
