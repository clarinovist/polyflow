import { prisma } from '@/lib/prisma';
import { IssueStatus, ProductionIssueType } from '@prisma/client';

export class ProductionIssueService {
    /**
     * Get all issues for a production order
     */
    static async getIssuesByOrder(productionOrderId: string) {
        return await prisma.productionIssue.findMany({
            where: { productionOrderId },
            include: {
                reportedBy: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { reportedAt: 'desc' }
        });
    }

    /**
     * Create a new production issue
     */
    static async createIssue(data: {
        productionOrderId: string;
        category: ProductionIssueType;
        description: string;
        reportedById?: string;
    }) {
        return await prisma.productionIssue.create({
            data: {
                productionOrderId: data.productionOrderId,
                category: data.category,
                description: data.description,
                reportedById: data.reportedById,
                status: IssueStatus.OPEN,
                reportedAt: new Date()
            }
        });
    }

    /**
     * Update issue status
     */
    static async updateIssueStatus(
        issueId: string,
        status: IssueStatus,
        resolvedNotes?: string
    ) {
        const updateData: {
            status: IssueStatus;
            resolvedAt?: Date | null;
            resolvedNotes?: string | null;
        } = { status };

        if (status === IssueStatus.RESOLVED) {
            updateData.resolvedAt = new Date();
            updateData.resolvedNotes = resolvedNotes;
        }

        return await prisma.productionIssue.update({
            where: { id: issueId },
            data: updateData
        });
    }

    /**
     * Delete an issue
     */
    static async deleteIssue(issueId: string) {
        return await prisma.productionIssue.delete({
            where: { id: issueId }
        });
    }
}
