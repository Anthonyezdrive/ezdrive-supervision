// Allowed origins — mobile apps send no Origin header so null must pass
const ALLOWED_ORIGINS = [
  "https://ezdrive-supervision.vercel.app",
  "https://pro.ezdrive.fr",
  "https://app.ezdrive.fr",
  "http://localhost:5173",
  "http://localhost:8081",
];

export function getCorsOrigin(req?: Request): string {
  const origin = req?.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Mobile apps (React Native) don't send Origin — allow them through
  if (!origin) return "*";
  // Unknown origin — block
  return ALLOWED_ORIGINS[0];
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
