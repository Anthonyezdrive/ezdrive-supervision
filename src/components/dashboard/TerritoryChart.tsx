import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Station } from "@/types/station";

const TERRITORY_COLORS: Record<string, string> = {
  Guadeloupe: "#00D4AA",
  Martinique: "#4ECDC4",
  Guyane: "#F39C12",
  "Réunion": "#3498DB",
};

export function TerritoryChart({ stations }: { stations: Station[] }) {
  const grouped = stations.reduce(
    (acc, s) => {
      const name = s.territory_name ?? "Non assigné";
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const data = Object.entries(grouped)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-foreground-muted text-sm">
        Aucune donnée
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: "#8892B0", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#8892B0", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111638",
            border: "1px solid #2A2F5A",
            borderRadius: "12px",
            color: "#F7F9FC",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={50}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={TERRITORY_COLORS[entry.name] ?? "#8892B0"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
