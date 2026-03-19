import { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useStations } from "@/hooks/useStations";
import { useCpo } from "@/contexts/CpoContext";
import { OCPP_STATUS_CONFIG } from "@/lib/constants";
import { StationDetailDrawer } from "@/components/stations/StationDetailDrawer";
import type { Station, OCPPStatus } from "@/types/station";
import { PageHelp } from "@/components/ui/PageHelp";

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

// Simple clustering: group nearby stations when zoomed out
interface Cluster {
  lat: number;
  lng: number;
  stations: Station[];
  mainStatus: OCPPStatus;
}

function clusterStations(stations: Station[], zoom: number): Cluster[] {
  if (zoom >= 11) {
    // No clustering at high zoom
    return stations.map((s) => ({
      lat: s.latitude!,
      lng: s.longitude!,
      stations: [s],
      mainStatus: s.ocpp_status,
    }));
  }
  const gridSize = zoom <= 7 ? 2 : zoom <= 9 ? 1 : 0.5;
  const clusters: Map<string, Cluster> = new Map();

  for (const s of stations) {
    const gLat = Math.floor(s.latitude! / gridSize) * gridSize;
    const gLng = Math.floor(s.longitude! / gridSize) * gridSize;
    const key = `${gLat},${gLng}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.stations.push(s);
      existing.lat = (existing.lat * (existing.stations.length - 1) + s.latitude!) / existing.stations.length;
      existing.lng = (existing.lng * (existing.stations.length - 1) + s.longitude!) / existing.stations.length;
    } else {
      clusters.set(key, { lat: s.latitude!, lng: s.longitude!, stations: [s], mainStatus: s.ocpp_status });
    }
  }

  // Set main status as the most frequent
  for (const c of clusters.values()) {
    const counts: Record<string, number> = {};
    for (const s of c.stations) {
      counts[s.ocpp_status] = (counts[s.ocpp_status] || 0) + 1;
    }
    c.mainStatus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as OCPPStatus ?? "Unknown";
  }

  return Array.from(clusters.values());
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => { onZoom(map.getZoom()); }, []);
  return null;
}

const STATUS_FILTERS: OCPPStatus[] = ["Available", "Charging", "Faulted", "Unknown"];

export function MapPage() {
  const { selectedCpoId } = useCpo();
  const { data: stations = [], isLoading } = useStations(selectedCpoId);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [statusFilter, setStatusFilter] = useState<OCPPStatus | null>(null);
  const [zoom, setZoom] = useState(9);

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
      <div className="px-6 pt-4 shrink-0">
        <PageHelp
          summary="Carte interactive de votre réseau de bornes avec position et statut en temps réel"
          items={[
            { label: "Marqueurs colorés", description: "Vert = disponible, bleu = en charge, rouge = en panne, gris = hors service." },
            { label: "Clusters", description: "Les bornes proches sont regroupées en clusters. Zoomez pour les détailler." },
            { label: "Popup détail", description: "Cliquez sur un marqueur pour voir le nom, l'adresse et le statut de la borne." },
            { label: "Zoom & navigation", description: "Utilisez la molette pour zoomer, ou les boutons +/- en haut à gauche." },
          ]}
        />
      </div>
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
            <ZoomTracker onZoom={setZoom} />

            {clusterStations(filteredStations, zoom).map((cluster, idx) => {
              const isCluster = cluster.stations.length > 1;
              const cfg = OCPP_STATUS_CONFIG[cluster.mainStatus];
              const station = cluster.stations[0];

              return (
                <CircleMarker
                  key={isCluster ? `cluster-${idx}` : station.id}
                  center={[cluster.lat, cluster.lng]}
                  radius={isCluster ? Math.min(12 + cluster.stations.length, 25) : 7}
                  pathOptions={{
                    fillColor: cfg.color,
                    fillOpacity: isCluster ? 0.7 : 0.9,
                    color: "#fff",
                    weight: isCluster ? 2.5 : 1.5,
                    opacity: 0.6,
                  }}
                >
                  <Popup minWidth={200}>
                    {isCluster ? (
                      <div style={{ fontFamily: "system-ui, sans-serif", padding: "2px 0" }}>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>
                          {cluster.stations.length} bornes
                        </p>
                        <div style={{ fontSize: 11, color: "#888", maxHeight: 150, overflowY: "auto" }}>
                          {cluster.stations.slice(0, 10).map((s) => (
                            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: OCPP_STATUS_CONFIG[s.ocpp_status].color, flexShrink: 0 }} />
                              <span style={{ cursor: "pointer", color: "#ccc" }} onClick={() => setSelectedStation(s)}>{s.name}</span>
                            </div>
                          ))}
                          {cluster.stations.length > 10 && <p style={{ color: "#666", marginTop: 4 }}>+{cluster.stations.length - 10} autres...</p>}
                        </div>
                        <p style={{ fontSize: 10, color: "#666", marginTop: 6 }}>Zoomez pour detailler</p>
                      </div>
                    ) : (
                      <div style={{ fontFamily: "system-ui, sans-serif", padding: "2px 0" }}>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 3px" }}>
                          {station.name}
                        </p>
                        <p style={{ color: "#888", fontSize: 11, margin: "0 0 8px" }}>
                          {[station.city, station.territory_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: cfg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                          {station.cpo_name && <span style={{ fontSize: 10, color: "#999" }}>· {station.cpo_name}</span>}
                        </div>
                        {station.max_power_kw && (
                          <p style={{ fontSize: 10, color: "#888", margin: "0 0 8px" }}>Puissance max : {station.max_power_kw} kW</p>
                        )}
                        <button
                          onClick={() => setSelectedStation(station)}
                          style={{ width: "100%", padding: "5px 10px", borderRadius: 6, backgroundColor: "#00D4AA", color: "#fff", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}
                        >
                          Voir le detail →
                        </button>
                      </div>
                    )}
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
