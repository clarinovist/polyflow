import { describe, it, expect } from 'vitest';
import {
    MODULE_DEFINITIONS,
    PACKAGE_TEMPLATES,
    ALL_MODULE_KEYS,
    getModule,
    getBusinessModules,
    getPackage,
    resolvePathToModule,
    resolvePermissionToModule,
    satisfiesDependencies,
    expandPackageModules,
    validateModuleKeys,
} from '../module-registry';

describe('Module Registry', () => {
    describe('MODULE_DEFINITIONS', () => {
        it('should have exactly 8 modules', () => {
            expect(MODULE_DEFINITIONS).toHaveLength(8);
        });

        it('CORE is always active', () => {
            const core = getModule('CORE');
            expect(core.alwaysActive).toBe(true);
        });

        it('no business module depends on itself', () => {
            for (const mod of MODULE_DEFINITIONS) {
                expect(mod.requiredModules).not.toContain(mod.key);
            }
        });

        it('every module has at least one workspace root', () => {
            for (const mod of MODULE_DEFINITIONS) {
                expect(mod.workspaceRoots.length).toBeGreaterThan(0);
            }
        });

        it('every module has at least one permission root', () => {
            for (const mod of MODULE_DEFINITIONS) {
                expect(mod.permissionRoots.length).toBeGreaterThan(0);
            }
        });

        it('all module keys are valid', () => {
            expect(ALL_MODULE_KEYS).toContain('CORE');
            expect(ALL_MODULE_KEYS).toContain('HRD');
            expect(ALL_MODULE_KEYS).toContain('SALES');
            expect(ALL_MODULE_KEYS).toContain('PURCHASING');
            expect(ALL_MODULE_KEYS).toContain('PRODUCTION');
            expect(ALL_MODULE_KEYS).toContain('INVENTORY');
            expect(ALL_MODULE_KEYS).toContain('FINANCE');
            expect(ALL_MODULE_KEYS).toContain('MAKLON');
        });
    });

    describe('PACKAGE_TEMPLATES', () => {
        it('should have at least 5 templates', () => {
            expect(PACKAGE_TEMPLATES.length).toBeGreaterThanOrEqual(5);
        });

        it('HR_CORE only has CORE + HRD', () => {
            const pkg = getPackage('HR_CORE');
            expect(pkg.modules).toEqual(['CORE', 'HRD']);
        });

        it('ERP_COMPLETE has all modules', () => {
            const pkg = getPackage('ERP_COMPLETE');
            expect(pkg.modules).toContain('HRD');
            expect(pkg.modules).toContain('SALES');
            expect(pkg.modules).toContain('PURCHASING');
            expect(pkg.modules).toContain('PRODUCTION');
            expect(pkg.modules).toContain('INVENTORY');
            expect(pkg.modules).toContain('FINANCE');
            expect(pkg.modules).toContain('MAKLON');
        });

        it('every package includes CORE', () => {
            for (const pkg of PACKAGE_TEMPLATES) {
                expect(pkg.modules).toContain('CORE');
            }
        });

        it('all package module keys are valid', () => {
            for (const pkg of PACKAGE_TEMPLATES) {
                const { invalid } = validateModuleKeys(pkg.modules);
                expect(invalid).toEqual([]);
            }
        });
    });

    describe('getModule', () => {
        it('throws for unknown module', () => {
            expect(() => getModule('UNKNOWN' as never)).toThrow(
                'Unknown module key',
            );
        });

        it('returns correct module', () => {
            const hrd = getModule('HRD');
            expect(hrd.key).toBe('HRD');
            expect(hrd.label).toBe('HRD');
        });
    });

    describe('getBusinessModules', () => {
        it('excludes CORE', () => {
            const business = getBusinessModules();
            expect(business.find((m) => m.key === 'CORE')).toBeUndefined();
        });

        it('returns all non-core modules', () => {
            const business = getBusinessModules();
            expect(business.length).toBe(7);
        });
    });

    describe('resolvePathToModule', () => {
        it('resolves /hrd to HRD', () => {
            expect(resolvePathToModule('/hrd')).toBe('HRD');
        });

        it('resolves /hrd/attendance to HRD', () => {
            expect(resolvePathToModule('/hrd/attendance')).toBe('HRD');
        });

        it('resolves /sales to SALES', () => {
            expect(resolvePathToModule('/sales')).toBe('SALES');
        });

        it('resolves /sales/mobile to SALES', () => {
            expect(resolvePathToModule('/sales/mobile')).toBe('SALES');
        });

        it('resolves /production to PRODUCTION', () => {
            expect(resolvePathToModule('/production')).toBe('PRODUCTION');
        });

        it('resolves /kiosk to PRODUCTION', () => {
            expect(resolvePathToModule('/kiosk')).toBe('PRODUCTION');
        });

        it('resolves /finance to FINANCE', () => {
            expect(resolvePathToModule('/finance')).toBe('FINANCE');
        });

        it('resolves /warehouse to INVENTORY', () => {
            expect(resolvePathToModule('/warehouse')).toBe('INVENTORY');
        });

        it('resolves /maklon to MAKLON', () => {
            expect(resolvePathToModule('/maklon')).toBe('MAKLON');
        });

        it('resolves /purchasing to PURCHASING', () => {
            expect(resolvePathToModule('/purchasing')).toBe('PURCHASING');
        });

        it('resolves /field to SALES', () => {
            expect(resolvePathToModule('/field')).toBe('SALES');
        });

        it('returns null for /dashboard (CORE)', () => {
            expect(resolvePathToModule('/dashboard')).toBe('CORE');
        });

        it('returns null for /support (CORE)', () => {
            expect(resolvePathToModule('/support')).toBe('CORE');
        });

        it('resolves longest prefix for overlapping paths', () => {
            // /warehouse/maklon/receipts — should resolve to INVENTORY
            // because /warehouse is longer than /maklon
            expect(resolvePathToModule('/warehouse/maklon/receipts')).toBe(
                'INVENTORY',
            );
        });
    });

    describe('resolvePermissionToModule', () => {
        it('resolves /hrd/employees to HRD', () => {
            expect(resolvePermissionToModule('/hrd/employees')).toBe('HRD');
        });

        it('resolves /dashboard/employees to HRD (permission root)', () => {
            expect(resolvePermissionToModule('/dashboard/employees')).toBe(
                'HRD',
            );
        });

        it('resolves /warehouse/inventory to INVENTORY', () => {
            expect(resolvePermissionToModule('/warehouse/inventory')).toBe(
                'INVENTORY',
            );
        });

        it('resolves /finance/journals to FINANCE', () => {
            expect(resolvePermissionToModule('/finance/journals')).toBe(
                'FINANCE',
            );
        });
    });

    describe('satisfiesDependencies', () => {
        it('HRD has no dependencies', () => {
            expect(satisfiesDependencies('HRD', ['CORE', 'HRD'])).toBe(true);
        });

        it('MAKLON has no dependencies', () => {
            expect(
                satisfiesDependencies('MAKLON', ['CORE', 'MAKLON']),
            ).toBe(true);
        });
    });

    describe('expandPackageModules', () => {
        it('HR_CORE expands to CORE + HRD', () => {
            const modules = expandPackageModules('HR_CORE');
            expect(modules).toContain('CORE');
            expect(modules).toContain('HRD');
            expect(modules).toHaveLength(2);
        });

        it('ERP_COMPLETE includes all modules', () => {
            const modules = expandPackageModules('ERP_COMPLETE');
            expect(modules.length).toBeGreaterThanOrEqual(8);
        });
    });

    describe('validateModuleKeys', () => {
        it('returns valid and invalid keys', () => {
            const result = validateModuleKeys(['HRD', 'SALES', 'BOGUS']);
            expect(result.valid).toEqual(['HRD', 'SALES']);
            expect(result.invalid).toEqual(['BOGUS']);
        });

        it('all valid for correct keys', () => {
            const result = validateModuleKeys([
                'CORE',
                'HRD',
                'SALES',
                'PURCHASING',
                'PRODUCTION',
                'INVENTORY',
                'FINANCE',
                'MAKLON',
            ]);
            expect(result.invalid).toEqual([]);
            expect(result.valid).toHaveLength(8);
        });
    });
});
