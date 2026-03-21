import type { OCPPStatus } from "./station";

export interface StationFilters {
  cpo: string | null;
  territory: string | null;
  status: OCPPStatus | null;
  source?: string;
  search: string;
}

export const DEFAULT_FILTERS: StationFilters = {
  cpo: null,
  territory: null,
  status: null,
  source: undefined,
  search: "",
};
