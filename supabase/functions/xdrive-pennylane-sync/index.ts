import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  ensurePennylaneCustomer,
  createPennylaneCustomerInvoice,
  createPennylaneSupplierInvoice,
} from "../_shared/pennylane-client.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const { action, invoiceId } = body;
    // action: "sync_bpu" | "sync_partner" | "sync_all_pending"

    const results: unknown[] = [];

    if (action === "sync_bpu" && invoiceId) {
      // Sync a specific BPU invoice to Pennylane
      const { data: invoice } = await supabase
        .from("xdrive_bpu_invoices")
        .select("*, xdrive_partners(partner_code, display_name, contact_email)")
        .eq("id", invoiceId)
        .single();

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.pennylane_invoice_id) throw new Error("Already synced to Pennylane");
      if (invoice.status !== "validated" && invoice.status !== "sent") {
        throw new Error("Invoice must be validated before syncing");
      }

      const partner = invoice.xdrive_partners;

      // Ensure customer exists
      await ensurePennylaneCustomer(
        partner.display_name,
        partner.contact_email || "contact@ezdrive.re",
        partner.partner_code
      );

      // Map BPU line items to Pennylane
      const lineItems = (invoice.line_items || []).map((li: Record<string, unknown>) => ({
        label: (li.label as string) || "Prestation",
        quantity: (li.quantity as number) || 1,
        unitPrice: (li.amount as number) || 0,
        vatRate: invoice.tva_rate || 0.085,
        accountCode: "706100", // Services
      }));

      const deadline = new Date(invoice.period_month);
      deadline.setDate(deadline.getDate() + 30);

      const result = await createPennylaneCustomerInvoice({
        customerSourceId: partner.partner_code,
        invoiceNumber: invoice.invoice_number,
        date: invoice.period_month,
        deadline: deadline.toISOString().split("T")[0],
        currency: "EUR",
        lineItems,
      });

      // Save Pennylane ID
      await supabase
        .from("xdrive_bpu_invoices")
        .update({ pennylane_invoice_id: result.id })
        .eq("id", invoiceId);

      results.push({ type: "bpu", invoiceId, pennylaneId: result.id });

    } else if (action === "sync_partner" && invoiceId) {
      // Sync a partner invoice to Pennylane as supplier invoice
      const { data: invoice } = await supabase
        .from("xdrive_partner_invoices")
        .select("*, xdrive_partners(partner_code, display_name)")
        .eq("id", invoiceId)
        .single();

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.pennylane_invoice_id) throw new Error("Already synced");

      const result = await createPennylaneSupplierInvoice({
        supplierName: invoice.xdrive_partners.display_name,
        invoiceNumber: invoice.invoice_number || `PART-${invoice.period_month}`,
        date: invoice.period_month,
        amount: invoice.ca_reseau_ttc || 0,
        label: `CA réseau ${invoice.xdrive_partners.display_name} — ${invoice.period_month}`,
        vatRate: 0.085,
      });

      await supabase
        .from("xdrive_partner_invoices")
        .update({ pennylane_invoice_id: result.id })
        .eq("id", invoiceId);

      results.push({ type: "partner", invoiceId, pennylaneId: result.id });

    } else if (action === "sync_all_pending") {
      // Sync all validated BPU invoices not yet in Pennylane
      const { data: pendingBpu } = await supabase
        .from("xdrive_bpu_invoices")
        .select("id")
        .in("status", ["validated", "sent"])
        .is("pennylane_invoice_id", null);

      for (const inv of (pendingBpu || [])) {
        try {
          // Recursive call with sync_bpu action
          const subResult = await fetch(req.url, {
            method: "POST",
            headers: req.headers,
            body: JSON.stringify({ action: "sync_bpu", invoiceId: inv.id }),
          });
          results.push(await subResult.json());
        } catch (err) {
          results.push({ error: (err as Error).message, invoiceId: inv.id });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
