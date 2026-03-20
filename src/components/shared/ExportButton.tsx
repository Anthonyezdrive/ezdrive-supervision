import { Download } from "lucide-react";

interface Column {
  key: string;
  label: string;
}

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  columns: Column[];
  disabled?: boolean;
}

function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(data: Record<string, unknown>[], columns: Column[]): string {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => escapeCSV(row[c.key])).join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportButton({ data, filename, columns, disabled }: ExportButtonProps) {
  const handleExport = () => {
    if (data.length === 0) return;
    const csv = generateCSV(data, columns);
    downloadCSV(csv, filename);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  );
}
