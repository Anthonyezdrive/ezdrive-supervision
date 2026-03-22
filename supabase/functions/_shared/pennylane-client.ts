const PENNYLANE_API_KEY = Deno.env.get("PENNYLANE_API_KEY");
const PENNYLANE_BASE_URL = "https://app.pennylane.com/api/external/v1";

interface PennylaneResponse {
  invoice?: { id: string; invoice_number: string };
  customer?: { source_id: string };
  error?: string;
}

export async function pennylaneRequest(
  path: string,
  method: "GET" | "POST" | "PUT" = "GET",
  body?: Record<string, unknown>
): Promise<PennylaneResponse> {
  if (!PENNYLANE_API_KEY) {
    throw new Error("PENNYLANE_API_KEY not configured");
  }

  const res = await fetch(`${PENNYLANE_BASE_URL}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${PENNYLANE_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Pennylane API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

// Ensure a customer exists in Pennylane
export async function ensurePennylaneCustomer(
  name: string,
  email: string,
  partnerCode: string
): Promise<string> {
  // Try to find existing
  try {
    const res = await pennylaneRequest(`/customers?filter[source_id]=${partnerCode}`);
    if (res.customer?.source_id) return res.customer.source_id;
  } catch {
    // Not found, create
  }

  const created = await pennylaneRequest("/customers", "POST", {
    customer: {
      source_id: partnerCode,
      name,
      emails: [email],
      customer_type: "company",
      country_alpha2: "FR",
    },
  });

  return created.customer?.source_id || partnerCode;
}

// Create a customer invoice (SURAYA → Partner)
export async function createPennylaneCustomerInvoice(params: {
  customerSourceId: string;
  invoiceNumber: string;
  date: string;
  deadline: string;
  currency: string;
  lineItems: Array<{
    label: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    accountCode: string;
  }>;
}): Promise<{ id: string; number: string }> {
  const res = await pennylaneRequest("/customer_invoices", "POST", {
    invoice: {
      date: params.date,
      deadline: params.deadline,
      currency: params.currency,
      invoice_number: params.invoiceNumber,
      customer_source_id: params.customerSourceId,
      line_items: params.lineItems.map((li) => ({
        label: li.label,
        quantity: li.quantity,
        currency_amount: li.unitPrice,
        unit: "piece",
        vat_rate: `FR_${li.vatRate * 100}_0`,
        plan_item_number: li.accountCode,
      })),
    },
  });

  return {
    id: res.invoice?.id || "",
    number: res.invoice?.invoice_number || params.invoiceNumber,
  };
}

// Create a supplier invoice (Partner → EZDrive)
export async function createPennylaneSupplierInvoice(params: {
  supplierName: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  label: string;
  vatRate: number;
}): Promise<{ id: string }> {
  const res = await pennylaneRequest("/supplier_invoices", "POST", {
    invoice: {
      date: params.date,
      supplier_name: params.supplierName,
      invoice_number: params.invoiceNumber || undefined,
      currency: "EUR",
      line_items: [{
        label: params.label,
        quantity: 1,
        currency_amount: params.amount,
        unit: "piece",
        vat_rate: `FR_${params.vatRate * 100}_0`,
      }],
    },
  });

  return { id: res.invoice?.id || "" };
}
