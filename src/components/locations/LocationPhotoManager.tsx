// ============================================================
// LocationPhotoManager — Photo gallery for locations with OCPI categories
// Wraps PhotoUpload with OCPI category support per photo
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Image,
  Upload,
  X,
  Loader2,
  Trash2,
  ImageIcon,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

type OcpiImageCategory = "OWNER" | "ENTRANCE" | "LOCATION" | "EVSE" | "OTHER";

interface LocationPhoto {
  url: string;
  category: OcpiImageCategory;
}

interface LocationPhotoManagerProps {
  locationId: string;
  existingPhotos?: LocationPhoto[];
  onPhotosChange?: (photos: LocationPhoto[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
}

const OCPI_CATEGORIES: { value: OcpiImageCategory; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ENTRANCE", label: "Entrance" },
  { value: "LOCATION", label: "Location" },
  { value: "EVSE", label: "EVSE" },
  { value: "OTHER", label: "Other" },
];

const BUCKET = "location-photos";

const CATEGORY_COLORS: Record<OcpiImageCategory, string> = {
  OWNER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ENTRANCE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  LOCATION: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  EVSE: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  OTHER: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ── Component ────────────────────────────────────────────────

export function LocationPhotoManager({
  locationId,
  existingPhotos = [],
  onPhotosChange,
  maxFiles = 10,
  maxSizeMB = 5,
  disabled = false,
}: LocationPhotoManagerProps) {
  const [photos, setPhotos] = useState<LocationPhoto[]>(existingPhotos);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null);
  const [openCategoryFor, setOpenCategoryFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref to track current photos and avoid stale closure on concurrent uploads
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  const folder = locationId;

  // ---- helpers ----

  const extractPath = useCallback(
    (url: string): string => {
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) return url.slice(idx + marker.length);
      const folderIdx = url.indexOf(folder);
      if (folderIdx !== -1) return url.slice(folderIdx);
      return url;
    },
    [folder],
  );

  const updatePhotos = useCallback(
    (next: LocationPhoto[]) => {
      setPhotos(next);
      onPhotosChange?.(next);
    },
    [onPhotosChange],
  );

  // ---- category change ----

  function handleCategoryChange(url: string, category: OcpiImageCategory) {
    const next = photos.map((p) =>
      p.url === url ? { ...p, category } : p,
    );
    updatePhotos(next);
    setOpenCategoryFor(null);
  }

  // ---- upload ----

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setError(null);

      const remaining = maxFiles - photos.length - uploading.length;
      if (remaining <= 0) {
        setError(`Maximum de ${maxFiles} photos atteint.`);
        return;
      }

      const selected = Array.from(files).slice(0, remaining);
      const maxBytes = maxSizeMB * 1024 * 1024;

      const tooLarge = selected.filter((f) => f.size > maxBytes);
      if (tooLarge.length > 0) {
        setError(
          `${tooLarge.length} fichier(s) trop volumineux (max ${maxSizeMB} Mo).`,
        );
        const valid = selected.filter((f) => f.size <= maxBytes);
        if (valid.length === 0) return;
        await uploadFiles(valid);
      } else {
        await uploadFiles(selected);
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photos, uploading, maxFiles, maxSizeMB],
  );

  const uploadFiles = async (files: File[]) => {
    const placeholders: UploadingFile[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      progress: 0,
    }));

    setUploading((prev) => [...prev, ...placeholders]);

    const newPhotos: LocationPhoto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const placeholder = placeholders[i];
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const path = `${folder}/${filename}`;

      setUploading((prev) =>
        prev.map((u) =>
          u.id === placeholder.id ? { ...u, progress: 30 } : u,
        ),
      );

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setError(`Erreur upload "${file.name}": ${uploadError.message}`);
        setUploading((prev) => prev.filter((u) => u.id !== placeholder.id));
        continue;
      }

      setUploading((prev) =>
        prev.map((u) =>
          u.id === placeholder.id ? { ...u, progress: 100 } : u,
        ),
      );

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      newPhotos.push({ url: publicUrl, category: "LOCATION" });

      setUploading((prev) => prev.filter((u) => u.id !== placeholder.id));
    }

    if (newPhotos.length > 0) {
      updatePhotos([...photosRef.current, ...newPhotos]);
    }
  };

  // ---- delete ----

  const handleDelete = useCallback(
    async (url: string) => {
      setError(null);
      const path = extractPath(url);

      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([path]);

      if (removeError) {
        setError(`Erreur suppression: ${removeError.message}`);
        setConfirmDelete(null);
        return;
      }

      const next = photos.filter((p) => p.url !== url);
      updatePhotos(next);
      setConfirmDelete(null);
    },
    [photos, extractPath, updatePhotos],
  );

  // ---- render ----

  const isEmpty = photos.length === 0 && uploading.length === 0;
  const canAddMore = photos.length + uploading.length < maxFiles;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <Image className="w-4 h-4 text-foreground-muted" />
          Photos du site
          {photos.length > 0 && (
            <span className="text-xs text-foreground-muted">
              ({photos.length}/{maxFiles})
            </span>
          )}
        </span>
        <span className="text-[10px] text-foreground-muted/60 uppercase tracking-wide">
          OCPI Images
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          <X className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto hover:text-red-300 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-8 text-foreground-muted">
          <ImageIcon className="w-10 h-10 mb-2 opacity-40" />
          <span className="text-sm">Aucune photo</span>
          <span className="text-xs text-foreground-muted/60 mt-1">
            Ajoutez des photos avec categories OCPI
          </span>
        </div>
      )}

      {/* Gallery grid */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.url}
              className="relative group"
              onMouseEnter={() => setHoveredPhoto(photo.url)}
              onMouseLeave={() => {
                setHoveredPhoto(null);
                if (confirmDelete === photo.url) setConfirmDelete(null);
                if (openCategoryFor === photo.url) setOpenCategoryFor(null);
              }}
            >
              {/* Thumbnail */}
              <img
                src={photo.url}
                alt=""
                className="w-full h-28 rounded-xl object-cover border border-border"
              />

              {/* Category badge */}
              <span
                className={cn(
                  "absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border",
                  CATEGORY_COLORS[photo.category],
                )}
              >
                {photo.category}
              </span>

              {/* Hover overlay with actions */}
              {!disabled && hoveredPhoto === photo.url && (
                <div className="absolute inset-0 rounded-xl bg-black/50 flex flex-col items-center justify-center gap-2">
                  {confirmDelete === photo.url ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.url)}
                      className="flex items-center gap-1 rounded-lg bg-red-500/80 px-2.5 py-1.5 text-xs text-white hover:bg-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Confirmer
                    </button>
                  ) : (
                    <>
                      {/* Category dropdown */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenCategoryFor(
                              openCategoryFor === photo.url ? null : photo.url,
                            )
                          }
                          className="flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30 transition-colors"
                        >
                          {photo.category}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {openCategoryFor === photo.url && (
                          <div className="absolute top-full mt-1 left-0 bg-surface border border-border rounded-lg shadow-xl z-10 py-1 min-w-[120px]">
                            {OCPI_CATEGORIES.map((cat) => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() =>
                                  handleCategoryChange(photo.url, cat.value)
                                }
                                className={cn(
                                  "w-full text-left px-3 py-1.5 text-xs transition-colors",
                                  photo.category === cat.value
                                    ? "text-primary bg-primary/10"
                                    : "text-foreground hover:bg-surface-elevated",
                                )}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(photo.url)}
                        className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-500/80 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Uploading placeholders */}
          {uploading.map((file) => (
            <div
              key={file.id}
              className="w-full h-28 rounded-xl border border-border bg-surface-elevated flex flex-col items-center justify-center gap-1"
            >
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-[10px] text-foreground-muted truncate max-w-[100px]">
                {file.name}
              </span>
              <div className="w-16 h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {canAddMore && !disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading.length > 0}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-foreground-muted transition-colors",
              uploading.length > 0
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-primary/50 hover:text-primary cursor-pointer",
            )}
          >
            <Upload className="w-4 h-4" />
            Ajouter photo
          </button>
        </>
      )}
    </div>
  );
}
