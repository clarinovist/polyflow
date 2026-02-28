import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

const project = new Project({
    tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const sourceFiles = [
    ...project.addSourceFilesAtPaths("src/app/api/**/*.ts")
];

console.log(`Found ${sourceFiles.length} API files to process.`);

let modifiedCount = 0;
const targetMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

for (const sourceFile of sourceFiles) {
    let isModified = false;

    let needsTenantImport = false;
    const hasTenantImport = sourceFile.getImportDeclarations().some(
        imp => imp.getModuleSpecifierValue() === '@/lib/tenant' &&
            imp.getNamedImports().some(ni => ni.getName() === 'withTenantRoute')
    );

    const functions = sourceFile.getFunctions();

    for (const func of functions) {
        if (!func.isExported() || !func.isAsync()) continue;

        const name = func.getName();
        if (!name || !targetMethods.includes(name)) continue;

        needsTenantImport = true;

        const funcText = func.getText().replace(/^export\s+/, '');

        func.replaceWithText(`export const ${name} = withTenantRoute(\n${funcText}\n);`);
        isModified = true;
    }

    if (isModified) {
        if (!hasTenantImport) {
            sourceFile.insertImportDeclaration(0, {
                moduleSpecifier: '@/lib/tenant',
                namedImports: ['withTenantRoute']
            });
        }

        sourceFile.saveSync();
        console.log(`Updated: ${sourceFile.getFilePath()}`);
        modifiedCount++;
    }
}

console.log(`\nFinished! Modified ${modifiedCount} files.`);
