// Allowed origins for web-facing endpoints (back-office, B2B portal)
const ALLOWED_ORIGINS = [
  'https://ezdrive-supervision.vercel.app',
  'https://ezdrive-supervision-*.vercel.app',
  'https://pro.ezdrive.fr',
  'https://app.ezdrive.fr',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8081',
];

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
      return pattern.test(origin);
    }
    return allowed === origin;
  });
}

/**
 * Dynamic CORS headers — reflects the requesting origin if it matches the whitelist.
 * Falls back to wildcard for requests without an Origin header (mobile apps, server-to-server).
 * Blocks unknown browser origins by returning an empty Allow-Origin (browser will reject).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  let allowOrigin: string;

  if (!origin) {
    // No Origin header — mobile app or server-to-server call, allow through
    allowOrigin = '*';
  } else if (isOriginAllowed(origin)) {
    // Known web origin — reflect it
    allowOrigin = origin;
  } else {
    // Unknown origin — return empty string so browser blocks the request
    allowOrigin = '';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

/**
 * Backward compatibility — wildcard for mobile/server calls without Origin.
 * Used by mobile-facing functions (road-*, gfx-*) and functions that don't pass req.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

/** @deprecated Use getCorsHeaders(req) for web-facing endpoints */
export function getCorsOrigin(req?: Request): string {
  const origin = req?.headers.get('origin');
  if (origin && isOriginAllowed(origin)) return origin;
  if (!origin) return '*';
  return '';
}
