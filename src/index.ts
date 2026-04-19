import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";

export interface Env {
  CHAT_ROOM_DO: DurableObjectNamespace;
  DO_SECRET_KEY: string;

  // Your Supabase project URL: https://<project-ref>.supabase.co
  SUPABASE_URL: string;

  // Use publishable key (or legacy anon key) for /auth/v1/user fallback checks
  SUPABASE_PUBLISHABLE_KEY: string;

  // Optional: legacy HS256 secret if you insist on local HS256 verify (not recommended)
  // SUPABASE_JWT_SECRET?: string; 
}

type VerifiedToken = {
  valid: boolean;
  payload?: JWTPayload;
  reason?: string;
};

function getBearerFromQuery(url: URL): string | null {
  const t = url.searchParams.get("token");
  return t && t.trim().length > 0 ? t : null;
}

// Cache JWKS resolver at module scope
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS(supabaseUrl: string) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwksCache;
}

async function verifySupabaseJWT(
  token: string,
  env: Env
): Promise<VerifiedToken> {
  const issuer = `${env.SUPABASE_URL}/auth/v1`;

  // 1) Preferred path: verify via JWKS (RS256/ES256, modern setup)
  try {
    const JWKS = getJWKS(env.SUPABASE_URL);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: "authenticated", // Supabase access tokens use this audience
    });

    return { valid: true, payload };
  } catch (e: any) {
    // 2) Fallback path for legacy HS256 projects:
    // Ask Supabase Auth server to validate the token directly.
    try {
      const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        method: "GET",
        headers: {
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        return {
          valid: false,
          reason: `Auth /user validation failed (${res.status})`,
        };
      }

      // Optional: parse user response if you want user id/email
      // const user = await res.json();

      return { valid: true };
    } catch (fallbackErr: any) {
      return {
        valid: false,
        reason: `JWT validation failed: ${e?.message || "unknown"}; fallback failed: ${fallbackErr?.message || "unknown"
          }`,
      };
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const roomId = url.pathname.split("/")[2];
    if (!roomId) return new Response("Missing Room ID", { status: 400 });

    const id = env.CHAT_ROOM_DO.idFromName(roomId);
    const stub = env.CHAT_ROOM_DO.get(id);
    return stub.fetch(request);
  },
};

export class ChatRoomDO extends DurableObject {
  constructor(ctx: DurableObjectState, readonly env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const providedKey = request.headers.get("X-DO-Access-Key");
      if (providedKey !== this.env.DO_SECRET_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      const payload = await request.json();
      this.broadcastToAll(JSON.stringify(payload));
      return new Response("Broadcasted", { status: 200 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const token = getBearerFromQuery(url);
    if (!token) {
      return new Response("Missing authentication token", { status: 401 });
    }

    const result = await verifySupabaseJWT(token, this.env);
    if (!result.valid) {
      return new Response("Unauthorized or Expired Token", { status: 401 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastToAll(messageString: string) {
    for (const connection of this.ctx.getWebSockets()) {
      try {
        connection.send(messageString);
      } catch (_) { }
    }
  }
}
