import { redirect } from 'next/navigation';

/** /sales/quotations/create → create order as quotation */
export default function QuotationCreateRedirect() {
    redirect('/sales/orders/create?intent=quotation');
}
