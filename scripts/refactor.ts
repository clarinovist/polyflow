import { Project } from "ts-morph";
import * as path from "path";

async function main() {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
  });

  const moves = [
    { from: "src/components/ui/accounting-input.tsx", to: "src/components/finance/accounting/" },
    { from: "src/components/ui/product-combobox.tsx", to: "src/components/products/" },
    { from: "src/components/GlobalSearch.tsx", to: "src/components/layout/" },
    { from: "src/components/theme-provider.tsx", to: "src/components/layout/" },
    { from: "src/components/ui/transaction-date-filter.tsx", to: "src/components/common/" },
    { from: "src/components/ui/url-transaction-date-filter.tsx", to: "src/components/common/" }
  ];

  console.log(`Preparing to move ${moves.length} files...`);

  for (const move of moves) {
    const sourcePath = path.resolve(move.from);
    const destDir = path.resolve(move.to);
    const sourceFile = project.getSourceFile(sourcePath);

    if (sourceFile) {
      console.log(`Moving ${move.from} to ${move.to}...`);
      let targetDir = project.getDirectory(destDir);
      if (!targetDir) {
        targetDir = project.createDirectory(destDir);
      }
      sourceFile.moveToDirectory(targetDir);
    } else {
      console.warn(`Could not find source file: ${move.from}`);
    }
  }

  console.log("Saving changes...");
  await project.save();
  console.log("Refactoring complete!");
}

main().catch(console.error);
