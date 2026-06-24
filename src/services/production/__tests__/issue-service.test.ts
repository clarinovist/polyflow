import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionIssueService } from '../issue-service';
import { prisma } from '@/lib/core/prisma';
import { IssueStatus, ProductionIssueType } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionIssue: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

describe('ProductionIssueService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getIssuesByOrder', () => {
        it('should return issues for a production order', async () => {
            // Arrange
            const mockIssues = [
                {
                    id: 'issue-1',
                    productionOrderId: 'po-1',
                    category: ProductionIssueType.MACHINE_BREAKDOWN,
                    description: 'Machine stopped working',
                    status: IssueStatus.OPEN,
                    reportedAt: new Date(),
                    reportedBy: { id: 'user-1', name: 'John' },
                },
                {
                    id: 'issue-2',
                    productionOrderId: 'po-1',
                    category: ProductionIssueType.QUALITY_ISSUE,
                    description: 'Defective product',
                    status: IssueStatus.RESOLVED,
                    reportedAt: new Date(),
                    reportedBy: { id: 'user-2', name: 'Jane' },
                },
            ];

            vi.mocked(prisma.productionIssue.findMany).mockResolvedValue(mockIssues as any);

            // Act
            const result = await ProductionIssueService.getIssuesByOrder('po-1');

            // Assert
            expect(result).toEqual(mockIssues);
            expect(prisma.productionIssue.findMany).toHaveBeenCalledWith({
                where: { productionOrderId: 'po-1' },
                include: {
                    reportedBy: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: { reportedAt: 'desc' },
            });
        });

        it('should return empty array when no issues found', async () => {
            // Arrange
            vi.mocked(prisma.productionIssue.findMany).mockResolvedValue([]);

            // Act
            const result = await ProductionIssueService.getIssuesByOrder('po-1');

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('createIssue', () => {
        it('should create a new production issue', async () => {
            // Arrange
            const issueData = {
                productionOrderId: 'po-1',
                category: ProductionIssueType.MACHINE_BREAKDOWN,
                description: 'Machine stopped working',
                reportedById: 'user-1',
            };

            const mockCreatedIssue = {
                id: 'issue-1',
                ...issueData,
                status: IssueStatus.OPEN,
                reportedAt: new Date(),
            };

            vi.mocked(prisma.productionIssue.create).mockResolvedValue(mockCreatedIssue as any);

            // Act
            const result = await ProductionIssueService.createIssue(issueData);

            // Assert
            expect(result).toEqual(mockCreatedIssue);
            expect(prisma.productionIssue.create).toHaveBeenCalledWith({
                data: {
                    productionOrderId: 'po-1',
                    category: ProductionIssueType.MACHINE_BREAKDOWN,
                    description: 'Machine stopped working',
                    reportedById: 'user-1',
                    status: IssueStatus.OPEN,
                    reportedAt: expect.any(Date),
                },
            });
        });

        it('should create issue without reportedById', async () => {
            // Arrange
            const issueData = {
                productionOrderId: 'po-1',
                category: ProductionIssueType.QUALITY_ISSUE,
                description: 'Defective product',
            };

            const mockCreatedIssue = {
                id: 'issue-1',
                ...issueData,
                status: IssueStatus.OPEN,
                reportedAt: new Date(),
            };

            vi.mocked(prisma.productionIssue.create).mockResolvedValue(mockCreatedIssue as any);

            // Act
            const result = await ProductionIssueService.createIssue(issueData);

            // Assert
            expect(result).toEqual(mockCreatedIssue);
        });
    });

    describe('updateIssueStatus', () => {
        it('should update issue status to RESOLVED with notes', async () => {
            // Arrange
            const mockUpdatedIssue = {
                id: 'issue-1',
                status: IssueStatus.RESOLVED,
                resolvedAt: new Date(),
                resolvedNotes: 'Fixed the machine',
            };

            vi.mocked(prisma.productionIssue.update).mockResolvedValue(mockUpdatedIssue as any);

            // Act
            const result = await ProductionIssueService.updateIssueStatus(
                'issue-1',
                IssueStatus.RESOLVED,
                'Fixed the machine'
            );

            // Assert
            expect(result).toEqual(mockUpdatedIssue);
            expect(prisma.productionIssue.update).toHaveBeenCalledWith({
                where: { id: 'issue-1' },
                data: {
                    status: IssueStatus.RESOLVED,
                    resolvedAt: expect.any(Date),
                    resolvedNotes: 'Fixed the machine',
                },
            });
        });

        it('should update issue status to IN_PROGRESS without notes', async () => {
            // Arrange
            const mockUpdatedIssue = {
                id: 'issue-1',
                status: IssueStatus.IN_PROGRESS,
            };

            vi.mocked(prisma.productionIssue.update).mockResolvedValue(mockUpdatedIssue as any);

            // Act
            const result = await ProductionIssueService.updateIssueStatus(
                'issue-1',
                IssueStatus.IN_PROGRESS
            );

            // Assert
            expect(result).toEqual(mockUpdatedIssue);
            expect(prisma.productionIssue.update).toHaveBeenCalledWith({
                where: { id: 'issue-1' },
                data: {
                    status: IssueStatus.IN_PROGRESS,
                },
            });
        });
    });

    describe('deleteIssue', () => {
        it('should delete an issue', async () => {
            // Arrange
            const mockDeletedIssue = { id: 'issue-1' };
            vi.mocked(prisma.productionIssue.delete).mockResolvedValue(mockDeletedIssue as any);

            // Act
            const result = await ProductionIssueService.deleteIssue('issue-1');

            // Assert
            expect(result).toEqual(mockDeletedIssue);
            expect(prisma.productionIssue.delete).toHaveBeenCalledWith({
                where: { id: 'issue-1' },
            });
        });
    });
});
