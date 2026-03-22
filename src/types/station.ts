export type OCPPStatus =
  | "Available"
  | "Preparing"
  | "Charging"
  | "SuspendedEVSE"
  | "SuspendedEV"
  | "Finishing"
  | "Unavailable"
  | "Faulted"
  | "Unknown";

export interface Connector {
  id: string;
  type: string;
  status: OCPPStatus;
  max_power_kw: number;
}

export type ConnectivityStatus = "Online" | "Offline" | null;
export type ChargerType = "Public" | "Business" | "Home" | null;
export type ChargingSpeed = "Slow" | "Fast" | "Mix_AC_DC" | null;
export type DeployState = "Production" | "Stock" | "Deprecated" | null;

export interface Station {
  id: string;
  gfx_id: string | null;
  road_id: string | null;
  source: "gfx" | "road";
  gfx_location_id: string | null;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  cpo_id: string | null;
  cpo_name: string | null;
  cpo_code: string | null;
  territory_id: string | null;
  territory_name: string | null;
  territory_code: string | null;
  ocpp_status: OCPPStatus;
  status_since: string;
  is_online: boolean;
  connectors: Connector[];
  max_power_kw: number | null;
  hours_in_status: number;
  last_synced_at: string;
  created_at: string;
  // Hardware & connectivity (from GFX expanded API)
  connectivity_status: ConnectivityStatus;
  remote_manageable: boolean | null;
  protocol_version: string | null;
  firmware_version: string | null;
  charge_point_vendor: string | null;
  charge_point_model: string | null;
  charger_type: ChargerType;
  charging_speed: ChargingSpeed;
  deploy_state: DeployState;
  heartbeat_interval: number | null;
  iso_15118_enabled: boolean;
  // OCPP identity (migration 015)
  ocpp_identity?: string | null;
  // Road enriched fields (migration 058)
  setup_status?: string | null;
  access_group_ids?: string[] | null;
  roaming_credential_ids?: string[] | null;
  ocpp_charging_station_id?: string | null;
  numeric_identity?: number | null;
}

export interface StationStatusEntry {
  id: string;
  station_id: string;
  previous_status: OCPPStatus | null;
  new_status: OCPPStatus;
  changed_at: string;
}

export interface StationKPIs {
  total_stations: number;
  available: number;
  charging: number;
  faulted: number;
  offline: number;
  other: number;
}

export interface CPOOperator {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

export interface Territory {
  id: string;
  name: string;
  code: string;
}
