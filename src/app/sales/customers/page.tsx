import { getCustomersWithCreditSummaryAction } from '@/actions/sales/customer';
import {
    CUSTOMER_CREDIT_FILTERS,
    type CustomerCreditFilter,
    type CustomerCreditSummaryPage,
} from '@/services/sales/credit-service';
import { parseTablePage, parseTablePageSize } from '@/lib/ui/table-query';
import CustomersPageClient from './CustomersPageClient';

type CustomersPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function singleValue(value: string | string[] | undefined) {
    return typeof value === 'string' ? value : undefined;
}

export default async function CustomersPage({
    searchParams = Promise.resolve({}),
}: CustomersPageProps) {
    const params = await searchParams;
    const requestedFilter = singleValue(params.filter);
    const filter: CustomerCreditFilter = CUSTOMER_CREDIT_FILTERS.includes(
        requestedFilter as CustomerCreditFilter,
    )
        ? (requestedFilter as CustomerCreditFilter)
        : 'all';
    const query = {
        search: singleValue(params.q)?.trim() ?? '',
        filter,
        page: parseTablePage(singleValue(params.page)),
        pageSize: parseTablePageSize(singleValue(params.pageSize)),
    };
    const result = await getCustomersWithCreditSummaryAction(query);
    const pageData: CustomerCreditSummaryPage =
        result.success && result.data
            ? result.data
            : {
                  customers: [],
                  total: 0,
                  page: query.page,
                  pageSize: query.pageSize,
                  totalPages: 0,
                  search: query.search,
                  filter: query.filter,
              };

    return (
        <CustomersPageClient
            pageData={pageData}
            error={result.success ? undefined : result.error}
        />
    );
}
