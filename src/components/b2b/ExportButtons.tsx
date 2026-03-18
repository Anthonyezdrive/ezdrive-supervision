import { Download } from "lucide-react";

interface ExportButtonsProps {
  onCSV: () => void;
  onPDF: () => void;
  disabled?: boolean;
}

export function ExportButtons({ onCSV, onPDF, disabled }: ExportButtonsProps) {
  const btnClass =
    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onCSV}
        disabled={disabled}
        className={`${btnClass} border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated`}
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </button>
      <button
        onClick={onPDF}
        disabled={disabled}
        className={`${btnClass} border-primary/40 bg-primary/10 text-primary hover:bg-primary/20`}
      >
        <Download className="w-3.5 h-3.5" />
        PDF
      </button>
    </div>
  );
}
