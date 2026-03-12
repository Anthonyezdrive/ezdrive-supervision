import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useStations } from "@/hooks/useStations";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import { StationDetailDrawer } from "@/components/stations/StationDetailDrawer";
import type { Station, OCPPStatus } from "@/types/station";

// Auto-fit map to show all stations
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

const STATUS_FILTERS: OCPPStatus[] = ["Available", "Charging", "Faulted", "Unknown"];

export function MapPage() {
  const { data: stations = [], isLoading } = useStations();
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [statusFilter, setStatusFilter] = useState<OCPPStatus | null>(null);

  const mappableStations = stations.filter(
    (s) => s.latitude != null && s.longitude != null
  );

  const filteredStations = statusFilter
    ? mappableStations.filter((s) => s.ocpp_status === statusFilter)
    : mappableStations;

  const bounds: LatLngBoundsExpression | null =
    mappableStations.length > 0
      ? (mappableStations.map((s) => [s.latitude!, s.longitude!]) as LatLngBoundsExpression)
      : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-xl">Carte</h1>
          <p className="text-sm text-foreground-muted">
            {mappableStations.length} bornes géolocalisées · refresh 30s
          </p>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              statusFilter === null
                ? "bg-primary/15 text-primary border-primary/30"
                : "text-foreground-muted border-border hover:border-foreground-muted"
            }`}
          >
            Toutes ({mappableStations.length})
          </button>
          {STATUS_FILTERS.map((s) => {
            const cfg = OCPP_STATUS_CONFIG[s];
            const count = mappableStations.filter((st) => st.ocpp_status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={{
                  backgroundColor:
                    statusFilter === s ? `${cfg.color}22` : "transparent",
                  color: statusFilter === s ? cfg.color : "#8892B0",
                  borderColor:
                    statusFilter === s ? cfg.color : "rgba(255,255,255,0.12)",
                }}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-foreground-muted text-sm">Chargement de la carte...</p>
          </div>
        ) : mappableStations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-foreground-muted text-sm">Aucune borne géolocalisée disponible.</p>
          </div>
        ) : (
          <MapContainer
            center={[14.6, -61]}
            zoom={9}
            className="h-full w-full"
            style={{ background: "#0D1117" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
            <AutoFitBounds bounds={bounds} />

            {filteredStations.map((station) => {
              const cfg = OCPP_STATUS_CONFIG[station.ocpp_status];
              return (
                <CircleMarker
                  key={station.id}
                  center={[station.latitude!, station.longitude!]}
                  radius={7}
                  pathOptions={{
                    fillColor: cfg.color,
                    fillOpacity: 0.9,
                    color: "#fff",
                    weight: 1.5,
                    opacity: 0.6,
                  }}
                >
                  <Popup minWidth={200}>
                    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2px 0" }}>
                      <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 3px" }}>
                        {station.name}
                      </p>
                      <p style={{ color: "#888", fontSize: 11, margin: "0 0 8px" }}>
                        {[station.city, station.territory_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: cfg.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: cfg.color,
                            fontWeight: 600,
                          }}
                        >
                          {cfg.label}
                        </span>
                        {station.cpo_name && (
                          <span style={{ fontSize: 10, color: "#999" }}>
                            · {station.cpo_name}
                          </span>
                        )}
                      </div>
                      {station.max_power_kw && (
                        <p style={{ fontSize: 10, color: "#888", margin: "0 0 8px" }}>
                          Puissance max : {station.max_power_kw} kW
                        </p>
                      )}
                      <button
                        onClick={() => setSelectedStation(station)}
                        style={{
                          width: "100%",
                          padding: "5px 10px",
                          borderRadius: 6,
                          backgroundColor: "#00D4AA",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Voir le détail →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}

        {/* Legend (bottom-left, overlaid on map) */}
        {!isLoading && mappableStations.length > 0 && (
          <div
            className="absolute bottom-5 left-5 z-[1000] rounded-xl p-3 space-y-2"
            style={{
              background: "rgba(13,17,23,0.88)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(8px)",
            }}
          >
            <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider mb-2">
              Légende
            </p>
            {STATUS_FILTERS.map((s) => {
              const cfg = OCPP_STATUS_CONFIG[s];
              const count = mappableStations.filter((st) => st.ocpp_status === s).length;
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: cfg.color }}
                  />
                  <span className="text-xs text-foreground-muted">{cfg.label}</span>
                  <span className="text-xs font-semibold text-foreground ml-auto pl-3">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Station detail drawer */}
      {selectedStation && (
        <StationDetailDrawer
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
