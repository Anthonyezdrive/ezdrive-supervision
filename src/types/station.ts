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
