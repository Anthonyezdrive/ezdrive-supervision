// ============================================================
// PhotoUpload — reusable photo upload component for interventions
// Handles gallery view, upload to Supabase Storage, delete, and
// progress feedback. Designed for the dark theme.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Upload, X, Loader2, Trash2, ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface PhotoUploadProps {
  bucket: string;
  folder: string;
  existingPhotos?: string[];
  onPhotosChange?: (urls: string[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
}

export function PhotoUpload({
  bucket,
  folder,
  existingPhotos = [],
  onPhotosChange,
  maxFiles = 10,
  maxSizeMB = 5,
  disabled = false,
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref to track current photos and avoid stale closure on concurrent uploads
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  // ---- helpers ----

  const extractPath = useCallback(
    (url: string): string => {
      // Extract the storage path from a public URL
      // URL format: .../storage/v1/object/public/<bucket>/<path>
      const marker = `/storage/v1/object/public/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) return url.slice(idx + marker.length);
      // Fallback: try to get everything after the folder prefix
      const folderIdx = url.indexOf(folder);
      if (folderIdx !== -1) return url.slice(folderIdx);
      return url;
    },
    [bucket, folder],
  );

  const updatePhotos = useCallback(
    (next: string[]) => {
      setPhotos(next);
      onPhotosChange?.(next);
    },
    [onPhotosChange],
  );

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

      // Validate sizes
      const tooLarge = selected.filter((f) => f.size > maxBytes);
      if (tooLarge.length > 0) {
        setError(
          `${tooLarge.length} fichier(s) trop volumineux (max ${maxSizeMB} Mo).`,
        );
        // Filter out oversized files but continue with valid ones
        const valid = selected.filter((f) => f.size <= maxBytes);
        if (valid.length === 0) return;
        await uploadFiles(valid);
      } else {
        await uploadFiles(selected);
      }

      // Reset file input so the same file can be selected again
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

    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const placeholder = placeholders[i];
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const path = `${folder}/${filename}`;

      // Simulate progress start
      setUploading((prev) =>
        prev.map((u) => (u.id === placeholder.id ? { ...u, progress: 30 } : u)),
      );

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setError(`Erreur upload "${file.name}": ${uploadError.message}`);
        setUploading((prev) => prev.filter((u) => u.id !== placeholder.id));
        continue;
      }

      // Mark progress complete
      setUploading((prev) =>
        prev.map((u) => (u.id === placeholder.id ? { ...u, progress: 100 } : u)),
      );

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(path);

      newUrls.push(publicUrl);

      // Remove placeholder
      setUploading((prev) => prev.filter((u) => u.id !== placeholder.id));
    }

    if (newUrls.length > 0) {
      updatePhotos([...photosRef.current, ...newUrls]);
    }
  };

  // ---- delete ----

  const handleDelete = useCallback(
    async (url: string) => {
      setError(null);
      const path = extractPath(url);

      const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (removeError) {
        setError(`Erreur suppression: ${removeError.message}`);
        setConfirmDelete(null);
        return;
      }

      const next = photos.filter((p) => p !== url);
      updatePhotos(next);
      setConfirmDelete(null);
    },
    [bucket, photos, extractPath, updatePhotos],
  );

  // ---- render ----

  const isEmpty = photos.length === 0 && uploading.length === 0;
  const canAddMore = photos.length + uploading.length < maxFiles;

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          <Camera className="w-4 h-4 text-foreground-muted" />
          Photos
          {photos.length > 0 && (
            <span className="text-xs text-foreground-muted">
              ({photos.length}/{maxFiles})
            </span>
          )}
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
        </div>
      )}

      {/* Gallery grid */}
      {!isEmpty && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url) => (
            <div
              key={url}
              className="relative group"
              onMouseEnter={() => setHoveredPhoto(url)}
              onMouseLeave={() => {
                setHoveredPhoto(null);
                if (confirmDelete === url) setConfirmDelete(null);
              }}
            >
              <img
                src={url}
                alt=""
                className="w-24 h-24 rounded-xl object-cover border border-border"
              />

              {/* Delete overlay */}
              {!disabled && hoveredPhoto === url && (
                <div className="absolute inset-0 w-24 h-24 rounded-xl bg-black/50 flex items-center justify-center">
                  {confirmDelete === url ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(url)}
                      className="flex items-center gap-1 rounded-lg bg-red-500/80 px-2 py-1 text-xs text-white hover:bg-red-500 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Supprimer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(url)}
                      className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-500/80 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Uploading placeholders */}
          {uploading.map((file) => (
            <div
              key={file.id}
              className="w-24 h-24 rounded-xl border border-border bg-surface-elevated flex flex-col items-center justify-center gap-1"
            >
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-[10px] text-foreground-muted truncate max-w-[80px]">
                {file.name}
              </span>
              <div className="w-14 h-1 rounded-full bg-border overflow-hidden">
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
