// ============================================================
// OCPI 2.2.1 TypeScript Types — EZDrive CPO + eMSP
// Aligned with Gireve IOP Implementation Guide v1.2
// ============================================================

// --- Enums ---

export type OcpiRole = "CPO" | "EMSP";
export type OcpiStatus = "AVAILABLE" | "BLOCKED" | "CHARGING" | "INOPERATIVE" | "OUTOFORDER" | "PLANNED" | "REMOVED" | "RESERVED" | "UNKNOWN";
export type OcpiConnectorStandard = "CHADEMO" | "DOMESTIC_A" | "DOMESTIC_B" | "DOMESTIC_C" | "DOMESTIC_D" | "DOMESTIC_E" | "DOMESTIC_F" | "DOMESTIC_G" | "DOMESTIC_H" | "DOMESTIC_I" | "DOMESTIC_J" | "DOMESTIC_K" | "DOMESTIC_L" | "IEC_60309_2_single_16" | "IEC_60309_2_three_16" | "IEC_60309_2_three_32" | "IEC_60309_2_three_64" | "IEC_62196_T1" | "IEC_62196_T1_COMBO" | "IEC_62196_T2" | "IEC_62196_T2_COMBO" | "IEC_62196_T3A" | "IEC_62196_T3C" | "PANTOGRAPH_BOTTOM_UP" | "PANTOGRAPH_TOP_DOWN" | "TESLA_R" | "TESLA_S";
export type OcpiConnectorFormat = "SOCKET" | "CABLE";
export type OcpiPowerType = "AC_1_PHASE" | "AC_3_PHASE" | "DC";
export type OcpiTokenType = "RFID" | "APP_USER" | "AD_HOC_USER" | "OTHER";
export type OcpiSessionStatus = "ACTIVE" | "COMPLETED" | "INVALID" | "PENDING" | "RESERVATION";
export type OcpiCommandType = "START_SESSION" | "STOP_SESSION" | "RESERVE_NOW" | "CANCEL_RESERVATION" | "UNLOCK_CONNECTOR";
export type OcpiCommandResult = "ACCEPTED" | "CANCELED_RESERVATION" | "EVSE_OCCUPIED" | "EVSE_INOPERATIVE" | "FAILED" | "NOT_SUPPORTED" | "REJECTED" | "TIMEOUT" | "UNKNOWN_RESERVATION";

// --- Core Objects ---

export interface OcpiVersion {
  version: string;
  url: string;
}

export interface OcpiVersionDetail {
  version: string;
  endpoints: OcpiEndpoint[];
}

export interface OcpiEndpoint {
  identifier: string;
  role: "SENDER" | "RECEIVER";
  url: string;
}

export interface OcpiCredentials {
  token: string;
  url: string;
  roles: OcpiCredentialRole[];
}

export interface OcpiCredentialRole {
  role: OcpiRole;
  business_details: OcpiBusinessDetails;
  party_id: string;
  country_code: string;
}

export interface OcpiBusinessDetails {
  name: string;
  website?: string;
  logo?: OcpiImage;
}

export interface OcpiImage {
  url: string;
  thumbnail?: string;
  category: string;
  type: string;
  width?: number;
  height?: number;
}

// --- Location Objects ---

export interface OcpiLocation {
  country_code: string;
  party_id: string;
  id: string;
  publish: boolean;
  name?: string;
  address: string;
  city: string;
  postal_code?: string;
  country: string;
  coordinates: OcpiGeoLocation;
  related_locations?: OcpiAdditionalGeoLocation[];
  parking_type?: string;
  evses?: OcpiEVSE[];
  directions?: OcpiDisplayText[];
  operator?: OcpiBusinessDetails;
  suboperator?: OcpiBusinessDetails;
  owner?: OcpiBusinessDetails;
  facilities?: string[];
  time_zone: string;
  opening_times?: OcpiHours;
  charging_when_closed?: boolean;
  images?: OcpiImage[];
  energy_mix?: OcpiEnergyMix;
  last_updated: string;
}

export interface OcpiGeoLocation {
  latitude: string;
  longitude: string;
}

export interface OcpiAdditionalGeoLocation extends OcpiGeoLocation {
  name?: OcpiDisplayText;
}

export interface OcpiDisplayText {
  language: string;
  text: string;
}

export interface OcpiHours {
  twentyfourseven: boolean;
  regular_hours?: OcpiRegularHours[];
  exceptional_openings?: OcpiExceptionalPeriod[];
  exceptional_closings?: OcpiExceptionalPeriod[];
}

export interface OcpiRegularHours {
  weekday: number;
  period_begin: string;
  period_end: string;
}

export interface OcpiExceptionalPeriod {
  period_begin: string;
  period_end: string;
}

export interface OcpiEnergyMix {
  is_green_energy: boolean;
  energy_sources?: { source: string; percentage: number }[];
  environ_impact?: { category: string; amount: number }[];
  supplier_name?: string;
  energy_product_name?: string;
}

// --- EVSE ---

export interface OcpiEVSE {
  uid: string;
  evse_id?: string;
  status: OcpiStatus;
  status_schedule?: OcpiStatusSchedule[];
  capabilities?: string[];
  connectors: OcpiConnector[];
  floor_level?: string;
  coordinates?: OcpiGeoLocation;
  physical_reference?: string;
  directions?: OcpiDisplayText[];
  parking_restrictions?: string[];
  images?: OcpiImage[];
  last_updated: string;
}

export interface OcpiStatusSchedule {
  period_begin: string;
  period_end?: string;
  status: OcpiStatus;
}

// --- Connector ---

export interface OcpiConnector {
  id: string;
  standard: OcpiConnectorStandard;
  format: OcpiConnectorFormat;
  power_type: OcpiPowerType;
  max_voltage: number;
  max_amperage: number;
  max_electric_power?: number;
  tariff_ids?: string[];
  terms_and_conditions?: string;
  last_updated: string;
}

// --- Token ---

export interface OcpiToken {
  country_code: string;
  party_id: string;
  uid: string;
  type: OcpiTokenType;
  contract_id: string;
  visual_number?: string;
  issuer: string;
  group_id?: string;
  valid: boolean;
  whitelist: "ALWAYS" | "ALLOWED" | "ALLOWED_OFFLINE" | "NEVER";
  language?: string;
  default_profile_type?: string;
  energy_contract?: OcpiEnergyContract;
  last_updated: string;
}

export interface OcpiEnergyContract {
  supplier_name: string;
  contract_id?: string;
}

// --- Session ---

export interface OcpiSession {
  country_code: string;
  party_id: string;
  id: string;
  start_date_time: string;
  end_date_time?: string;
  kwh: number;
  cdr_token: OcpiCdrToken;
  auth_method: string;
  authorization_reference?: string;
  location_id: string;
  evse_uid: string;
  connector_id: string;
  meter_id?: string;
  currency: string;
  charging_periods?: OcpiChargingPeriod[];
  total_cost?: OcpiPrice;
  status: OcpiSessionStatus;
  last_updated: string;
}

export interface OcpiCdrToken {
  country_code: string;
  party_id: string;
  uid: string;
  type: OcpiTokenType;
  contract_id: string;
}

export interface OcpiPrice {
  excl_vat: number;
  incl_vat?: number;
}

export interface OcpiChargingPeriod {
  start_date_time: string;
  dimensions: OcpiCdrDimension[];
  tariff_id?: string;
}

export interface OcpiCdrDimension {
  type: "CURRENT" | "ENERGY" | "ENERGY_EXPORT" | "ENERGY_IMPORT" | "MAX_CURRENT" | "MIN_CURRENT" | "MAX_POWER" | "MIN_POWER" | "PARKING_TIME" | "POWER" | "RESERVATION_TIME" | "STATE_OF_CHARGE" | "TIME";
  volume: number;
}

// --- CDR ---

export interface OcpiCDR {
  country_code: string;
  party_id: string;
  id: string;
  start_date_time: string;
  end_date_time: string;
  session_id?: string;
  cdr_token: OcpiCdrToken;
  auth_method: string;
  authorization_reference?: string;
  cdr_location: OcpiCdrLocation;
  meter_id?: string;
  currency: string;
  tariffs?: OcpiTariff[];
  charging_periods: OcpiChargingPeriod[];
  signed_data?: unknown;
  total_cost: OcpiPrice;
  total_fixed_cost?: OcpiPrice;
  total_energy: number;
  total_energy_cost?: OcpiPrice;
  total_time: number;
  total_time_cost?: OcpiPrice;
  total_parking_time?: number;
  total_parking_cost?: OcpiPrice;
  total_reservation_cost?: OcpiPrice;
  remark?: string;
  invoice_reference_id?: string;
  credit?: boolean;
  credit_reference_id?: string;
  last_updated: string;
}

export interface OcpiCdrLocation {
  id: string;
  name?: string;
  address: string;
  city: string;
  postal_code?: string;
  country: string;
  coordinates: OcpiGeoLocation;
  evse_uid: string;
  evse_id?: string;
  connector_id: string;
  connector_standard: string;
  connector_format: string;
  connector_power_type: string;
}

// --- Tariff ---

export interface OcpiTariff {
  country_code: string;
  party_id: string;
  id: string;
  currency: string;
  type?: string;
  tariff_alt_text?: OcpiDisplayText[];
  tariff_alt_url?: string;
  min_price?: OcpiPrice;
  max_price?: OcpiPrice;
  elements: OcpiTariffElement[];
  start_date_time?: string;
  end_date_time?: string;
  energy_mix?: OcpiEnergyMix;
  last_updated: string;
}

export interface OcpiTariffElement {
  price_components: OcpiPriceComponent[];
  restrictions?: OcpiTariffRestrictions;
}

export interface OcpiPriceComponent {
  type: "ENERGY" | "FLAT" | "PARKING_TIME" | "TIME";
  price: number;
  vat?: number;
  step_size: number;
}

export interface OcpiTariffRestrictions {
  start_time?: string;
  end_time?: string;
  start_date?: string;
  end_date?: string;
  min_kwh?: number;
  max_kwh?: number;
  min_current?: number;
  max_current?: number;
  min_power?: number;
  max_power?: number;
  min_duration?: number;
  max_duration?: number;
  day_of_week?: number[];
  reservation?: string;
}

// --- Command ---

export interface OcpiStartSession {
  response_url: string;
  token: OcpiToken;
  location_id: string;
  evse_uid?: string;
  connector_id?: string;  // Gireve extension
  authorization_reference?: string;
}

export interface OcpiStopSession {
  response_url: string;
  session_id: string;
}

export interface OcpiCommandResponse {
  result: OcpiCommandResult;
  timeout: number;
  message?: OcpiDisplayText[];
}

// --- OCPI Standard Response ---

export interface OcpiResponse<T = unknown> {
  data: T;
  status_code: number;
  status_message: string;
  timestamp: string;
}

// --- OCPP to OCPI Status Mapping ---

export const OCPP_TO_OCPI_STATUS: Record<string, OcpiStatus> = {
  "Available": "AVAILABLE",
  "Preparing": "AVAILABLE",
  "Charging": "CHARGING",
  "SuspendedEVSE": "BLOCKED",
  "SuspendedEV": "CHARGING",
  "Finishing": "CHARGING",
  "Reserved": "RESERVED",
  "Unavailable": "INOPERATIVE",
  "Faulted": "OUTOFORDER",
  "Unknown": "UNKNOWN",
  "Offline": "INOPERATIVE",
};

// --- EZDrive Constants ---

export const EZDRIVE_COUNTRY_CODE = "FR";
export const EZDRIVE_PARTY_ID = "EZD";
export const EZDRIVE_OPERATOR_NAME = "EZDrive";
export const EZDRIVE_OPERATOR_WEBSITE = "https://ezdrive.energy";

export const GIREVE_PREPROD_URL = "https://ocpi-pp-iop.gireve.com";
export const GIREVE_PROD_URL = "https://ocpi-iop.gireve.com";

export const GIREVE_PREPROD_COUNTRY = "FR";
export const GIREVE_PREPROD_PARTY = "107";  // FR107 preprod
export const GIREVE_PROD_COUNTRY = "FR";
export const GIREVE_PROD_PARTY = "007";     // FR007 prod

export const OCPI_VERSION = "2.2.1";

// OCPI Modules that EZDrive implements
export const EZDRIVE_CPO_MODULES = [
  "credentials",
  "locations",
  "tariffs",
  "sessions",
  "cdrs",
  "commands",
  "tokens",
] as const;

export const EZDRIVE_EMSP_MODULES = [
  "credentials",
  "locations",
  "tariffs",
  "sessions",
  "cdrs",
  "commands",
  "tokens",
] as const;
