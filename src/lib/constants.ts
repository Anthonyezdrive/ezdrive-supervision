import type { OCPPStatus } from "@/types/station";

export const OCPP_STATUS_CONFIG: Record<
  OCPPStatus,
  { label: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  Available: {
    label: "Disponible",
    color: "#00D4AA",
    bgClass: "bg-status-available/15",
    textClass: "text-status-available",
    borderClass: "border-status-available",
  },
  Charging: {
    label: "En charge",
    color: "#4ECDC4",
    bgClass: "bg-status-charging/15",
    textClass: "text-status-charging",
    borderClass: "border-status-charging",
  },
  Preparing: {
    label: "Préparation",
    color: "#F39C12",
    bgClass: "bg-status-preparing/15",
    textClass: "text-status-preparing",
    borderClass: "border-status-preparing",
  },
  SuspendedEVSE: {
    label: "Suspendu EVSE",
    color: "#E67E22",
    bgClass: "bg-status-suspended/15",
    textClass: "text-status-suspended",
    borderClass: "border-status-suspended",
  },
  SuspendedEV: {
    label: "Suspendu EV",
    color: "#E67E22",
    bgClass: "bg-status-suspended/15",
    textClass: "text-status-suspended",
    borderClass: "border-status-suspended",
  },
  Finishing: {
    label: "Finalisation",
    color: "#3498DB",
    bgClass: "bg-status-finishing/15",
    textClass: "text-status-finishing",
    borderClass: "border-status-finishing",
  },
  Unavailable: {
    label: "Indisponible",
    color: "#BDC3C7",
    bgClass: "bg-status-unavailable/15",
    textClass: "text-status-unavailable",
    borderClass: "border-status-unavailable",
  },
  Faulted: {
    label: "En panne",
    color: "#FF6B6B",
    bgClass: "bg-status-faulted/15",
    textClass: "text-status-faulted",
    borderClass: "border-status-faulted",
  },
  Unknown: {
    label: "Inconnu",
    color: "#95A5A6",
    bgClass: "bg-status-offline/15",
    textClass: "text-status-offline",
    borderClass: "border-status-offline",
  },
};

export const ALL_OCPP_STATUSES: OCPPStatus[] = [
  "Available",
  "Charging",
  "Preparing",
  "SuspendedEVSE",
  "SuspendedEV",
  "Finishing",
  "Unavailable",
  "Faulted",
  "Unknown",
];

export const POLLING_INTERVAL = 30_000; // 30 seconds
export const STALE_TIME = 15_000; // 15 seconds
