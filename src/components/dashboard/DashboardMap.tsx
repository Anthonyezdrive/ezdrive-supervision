// ── Lazy-loaded map component for DashboardPage ──────────
// Extracted to avoid loading Leaflet (~200KB) until needed
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import type { Station } from "@/types/station";

// ── Map helpers ───────────────────────────────────────────
function AutoFitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      fitted.current = true;
    }
  }, [map, bounds]);
  return null;
}

function getMarkerColor(station: Station): string {
  if (!station.is_online) return "#95A5A6"; // gray — offline
  switch (station.ocpp_status) {
    case "Available": return "#00D4AA"; // green
    case "Charging": case "Preparing": case "Finishing": return "#3498DB"; // blue
    case "SuspendedEVSE": case "SuspendedEV": return "#E67E22"; // orange
    case "Faulted": return "#FF6B6B"; // red
    case "Unavailable": return "#FBBF24"; // yellow
    default: return "#95A5A6";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

interface DashboardMapProps {
  stations: Station[];
  bounds: LatLngBoundsExpression | null;
}

export function DashboardMap({ stations, bounds }: DashboardMapProps) {
  return (
    <MapContainer
      center={[14.6, -61]}
      zoom={9}
      className="h-full w-full"
      style={{ background: "#0D1117" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <AutoFitBounds bounds={bounds} />
      {stations.map((station) => {
        const markerColor = getMarkerColor(station);
        const cfg = OCPP_STATUS_CONFIG[station.ocpp_status];
        const statusLabel = !station.is_online ? "Hors ligne" : cfg.label;
        return (
          <CircleMarker
            key={station.id}
            center={[station.latitude!, station.longitude!]}
            radius={6}
            pathOptions={{
              fillColor: markerColor,
              fillOpacity: 0.9,
              color: "#fff",
              weight: 1.5,
              opacity: 0.5,
            }}
          >
            <LeafletTooltip
              direction="top"
              offset={[0, -8]}
              opacity={0.95}
            >
              <div style={{ fontFamily: "system-ui, sans-serif", minWidth: 160 }}>
                <p style={{ fontWeight: 700, fontSize: 12, margin: "0 0 2px" }}>{station.name}</p>
                <p style={{ fontSize: 11, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: markerColor }} />
                  <span style={{ color: markerColor, fontWeight: 600 }}>{statusLabel}</span>
                </p>
                {station.max_power_kw && station.ocpp_status === "Charging" && (
                  <p style={{ fontSize: 10, color: "#888", margin: "0 0 2px" }}>
                    Puissance : {station.max_power_kw} kW
                  </p>
                )}
                <p style={{ fontSize: 10, color: "#888", margin: 0 }}>
                  Dernier signal : {timeAgo(station.last_synced_at)}
                </p>
              </div>
            </LeafletTooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export default DashboardMap;
