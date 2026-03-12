import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Station } from "@/types/station";

const CPO_COLORS: Record<string, string> = {
  EZDrive: "#00D4AA",
  TotalEnergies: "#FF6B6B",
};

export function CPOChart({ stations }: { stations: Station[] }) {
  const grouped = stations.reduce(
    (acc, s) => {
      const name = s.cpo_name ?? "Non assigné";
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const data = Object.entries(grouped).map(([name, value]) => ({
    name,
    value,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-foreground-muted text-sm">
        Aucune donnée
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width="60%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            dataKey="value"
            stroke="none"
            paddingAngle={3}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={CPO_COLORS[entry.name] ?? "#8892B0"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#111638",
              border: "1px solid #2A2F5A",
              borderRadius: "12px",
              color: "#F7F9FC",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="space-y-3">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: CPO_COLORS[entry.name] ?? "#8892B0",
              }}
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                {entry.name}
              </p>
              <p className="text-xs text-foreground-muted">
                {entry.value} bornes
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
