import { Project, SyntaxKind, FunctionDeclaration } from 'ts-morph';
import path from 'path';

const project = new Project({
    tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const sourceFiles = [
    ...project.addSourceFilesAtPaths("src/actions/**/*.ts")
];

console.log(`Found ${sourceFiles.length} files to process.`);

let modifiedCount = 0;

for (const sourceFile of sourceFiles) {
    let isModified = false;

    // Skip if it doesn't have 'use server'
    const hasUseServer = sourceFile.getStatements().some(stmt =>
        stmt.getKind() === SyntaxKind.ExpressionStatement &&
        stmt.getText().includes('use server')
    );

    if (!hasUseServer) continue;

    // Check if we need to mock DB import
    let needsTenantImport = false;
    const hasTenantImport = sourceFile.getImportDeclarations().some(
        imp => imp.getModuleSpecifierValue() === '@/lib/tenant' &&
            imp.getNamedImports().some(ni => ni.getName() === 'withTenant')
    );

    const functions = sourceFile.getFunctions();

    for (const func of functions) {
        if (!func.isExported() || !func.isAsync()) continue;

        // Ensure we haven't already wrapped it (e.g. export const foo = withTenant(async function foo() {}))
        // Since Next.js requires `export async function name()`, wrapping it might turn it into a 
        // variable declaration: `export const name = withTenant(async () => {})`

        const name = func.getName();
        if (!name) continue;

        needsTenantImport = true;

        // Convert `export async function foo(arg: string) { ... }`
        // To `export const foo = withTenant(async function foo(arg: string) { ... })`
        // 
        // Step 1: Remove export keyword and rename if necessary, but actually we can just 
        // replace the whole function declaration with a variable statement.

        const funcText = func.getText().replace(/^export\s+/, '');

        func.replaceWithText(`export const ${name} = withTenant(\n${funcText}\n);`);
        isModified = true;
    }

    if (isModified) {
        if (!hasTenantImport) {
            // Add import below 'use server' if possible, or at top
            sourceFile.insertImportDeclaration(1, {
                moduleSpecifier: '@/lib/tenant',
                namedImports: ['withTenant']
            });
        }

        sourceFile.saveSync();
        console.log(`Updated: ${sourceFile.getFilePath()}`);
        modifiedCount++;
    }
}

console.log(`\nFinished! Modified ${modifiedCount} files.`);
