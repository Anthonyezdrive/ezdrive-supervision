export interface XDrivePartner {
  id: string;
  b2b_client_id: string;
  partner_code: string;
  display_name: string;
  portal_subdomain: string | null;
  logo_url: string | null;
  theme_config: XDriveTheme;
  enabled_modules: XDriveModule[];
  contact_email: string | null;
  created_at: string;
}

export interface XDriveTheme {
  primaryColor: string;
  accentColor: string;
  secondaryColor?: string;
  logoHeight?: number;
}

export type XDriveModule = 'dashboard' | 'cdrs' | 'breakdown' | 'reconciliation' | 'bpu' | 'billing' | 'exports';

export interface XDriveBPUConfig {
  id: string;
  partner_id: string;
  effective_from: string;
  effective_to: string | null;
  supervision_monthly: number;
  support_monthly_per_territory: number;
  support_territories: number;
  floor_monthly: number;
  pricing_tiers: BPUPricingTier[];
  transaction_rates: BPUTransactionRates;
  optional_services: BPUOptionalService[];
}

export interface BPUPricingTier {
  min_pdc: number;
  max_pdc: number | null;
  ac22_public: number;
  ac_privatif: number;
  dc_50_100: number;
}

export interface BPUTransactionRates {
  ac22_privatif: number;
  dc25_privatif: number;
  ac_dc_public: number;
}

export interface BPUOptionalService {
  code: string;
  label: string;
  unit_price: number;
  unit: string;
}

export interface XDriveReconciliation {
  id: string;
  partner_id: string;
  period_month: string;
  ca_cdrs_ht: number;
  ca_cdrs_ttc: number;
  sessions_count: number;
  energy_kwh: number;
  encaissements_cb: number;
  encaissements_emsp: number;
  encaissements_app: number;
  total_encaisse: number;
  ecart_brut: number;
  ecart_details: Record<string, number>;
  status: 'draft' | 'verified' | 'approved';
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
}

export interface XDriveBPUInvoice {
  id: string;
  partner_id: string;
  invoice_number: string;
  period_month: string;
  supervision_amount: number;
  connectivity_amount: number;
  transaction_amount: number;
  floor_applied: boolean;
  support_amount: number;
  optional_amount: number;
  total_ht: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  line_items: Record<string, unknown>[];
  pdc_inventory: Record<string, unknown>;
  status: 'draft' | 'review' | 'validated' | 'sent' | 'paid';
  pdf_url: string | null;
}
