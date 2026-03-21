import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDuration(hours: number): string {
  if (!hours || hours <= 0 || isNaN(hours)) return "0min";
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}min`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}j ${remainingHours}h` : `${days}j`;
}

export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "\u2014";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `il y a ${diffSec}s`;
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)}h`;
  return `il y a ${Math.floor(diffSec / 86400)}j`;
}
