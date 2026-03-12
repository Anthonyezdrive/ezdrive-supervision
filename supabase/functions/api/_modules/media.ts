// ============================================================
// EZDrive Consumer API — Media Upload Module
// Image upload to Supabase Storage
// ============================================================

import {
  apiSuccess,
  apiBadRequest,
  apiServerError,
} from "../../_shared/api-response.ts";
import { getServiceClient } from "../../_shared/auth-middleware.ts";
import type { RouteContext } from "../index.ts";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET_NAME = "ezdrive-media";

export async function handleMedia(ctx: RouteContext): Promise<Response> {
  if (ctx.method !== "POST") {
    return apiBadRequest("POST required for media upload");
  }

  const action = ctx.segments[0] ?? "upload";

  if (action === "upload") {
    return uploadImage(ctx);
  }

  return apiBadRequest("Unknown media action");
}

async function uploadImage(ctx: RouteContext): Promise<Response> {
  const db = getServiceClient();
  const userId = ctx.auth!.user.id;

  try {
    const contentType = ctx.req.headers.get("content-type") ?? "";

    // Handle multipart form data
    if (contentType.includes("multipart/form-data")) {
      const formData = await ctx.req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return apiBadRequest("No file provided. Use 'file' field in form data.");
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return apiBadRequest(`File type not allowed. Allowed: ${ALLOWED_TYPES.join(", ")}`);
      }

      if (file.size > MAX_FILE_SIZE) {
        return apiBadRequest("File too large. Maximum 5MB.");
      }

      // Generate unique path
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { data, error } = await db.storage
        .from(BUCKET_NAME)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("[Media] Upload error:", error);
        return apiServerError("Failed to upload file");
      }

      // Get public URL
      const { data: urlData } = db.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return apiSuccess({
        path: data.path,
        url: urlData.publicUrl,
        size: file.size,
        content_type: file.type,
      });
    }

    // Handle base64 encoded image
    if (contentType.includes("application/json")) {
      const body = await ctx.req.json();

      if (!body.data || !body.content_type) {
        return apiBadRequest("data (base64) and content_type required");
      }

      if (!ALLOWED_TYPES.includes(body.content_type)) {
        return apiBadRequest(`File type not allowed. Allowed: ${ALLOWED_TYPES.join(", ")}`);
      }

      // Decode base64
      const binaryStr = atob(body.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      if (bytes.length > MAX_FILE_SIZE) {
        return apiBadRequest("File too large. Maximum 5MB.");
      }

      const ext = body.content_type.split("/")[1] ?? "jpg";
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { data, error } = await db.storage
        .from(BUCKET_NAME)
        .upload(path, bytes, {
          contentType: body.content_type,
          upsert: false,
        });

      if (error) {
        console.error("[Media] Upload error:", error);
        return apiServerError("Failed to upload file");
      }

      const { data: urlData } = db.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return apiSuccess({
        path: data.path,
        url: urlData.publicUrl,
        size: bytes.length,
        content_type: body.content_type,
      });
    }

    return apiBadRequest("Unsupported content type. Use multipart/form-data or application/json with base64.");
  } catch (err) {
    console.error("[Media] Error:", err);
    return apiServerError("Upload failed");
  }
}
