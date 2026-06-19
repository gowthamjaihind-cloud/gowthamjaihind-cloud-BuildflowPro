import { useProjectDataQuery } from "./queries";

export function useProjectData<T>(
  projectId: string,
  type:
    | "inventory"
    | "suppliers"
    | "purchase_orders"
    | "goodsReceiptNotes"
    | "costs"
    | "labor_rate_cards"
    | "ledger"
    | "receipts"
    | "labor_logs"
    | "ra_bills"
    | "material_issues"
    | "documents"
    | "daily_site_reports"
    | "client_payments",
  orderByField?: string,
  orderDirection?: "asc" | "desc",
) {
  const { data, isLoading } = useProjectDataQuery<T>(
    projectId,
    type,
    orderByField,
    orderDirection
  );

  return { data: data || [], isLoading };
}
