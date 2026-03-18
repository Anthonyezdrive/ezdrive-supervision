import { useB2BFilters } from "@/contexts/B2BFilterContext";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { RotateCcw } from "lucide-react";

interface B2BFilterBarProps {
  availableSites: string[];
  availableBornes: string[];
  availableTokens: string[];
  availableYears: number[];
  borneLabelMap?: Map<string, string>;
  tokenLabelMap?: Map<string, string>;
}

export function B2BFilterBar({
  availableSites,
  availableBornes,
  availableTokens,
  availableYears,
  borneLabelMap,
  tokenLabelMap,
}: B2BFilterBarProps) {
  const { year, sites, bornes, tokens, setYear, setSites, setBornes, setTokens, resetFilters } =
    useB2BFilters();

  const hasFilters = sites.length > 0 || bornes.length > 0 || tokens.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Year selector */}
      <div>
        <label className="block text-xs text-foreground-muted uppercase tracking-wider mb-1">
          Année
        </label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none min-w-[100px]"
        >
          {availableYears.length > 0
            ? availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            : [2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
        </select>
      </div>

      {/* Sites */}
      <MultiSelectDropdown
        label="Sites"
        options={availableSites}
        selected={sites}
        onChange={setSites}
        placeholder="Tous les sites"
      />

      {/* Bornes */}
      <MultiSelectDropdown
        label="Bornes"
        options={availableBornes}
        selected={bornes}
        onChange={setBornes}
        placeholder="Toutes les bornes"
        labelMap={borneLabelMap}
      />

      {/* Tokens */}
      <MultiSelectDropdown
        label="Tokens"
        options={availableTokens}
        selected={tokens}
        onChange={setTokens}
        placeholder="Tous les tokens"
        labelMap={tokenLabelMap}
      />

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={resetFilters}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
          title="Réinitialiser les filtres"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      )}
    </div>
  );
}
