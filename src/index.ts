import { DurableObject } from "cloudflare:workers";

export interface Env {
  CHAT_ROOM_DO: DurableObjectNamespace;
  DO_SECRET_KEY: string;

  // The Supabase project whose rooms this DO serves (the Hub, or a Silo):
  // https://<project-ref>.supabase.co
  SUPABASE_URL: string;

  // Publishable key (or legacy anon key) of that project, for PostgREST.
  SUPABASE_PUBLISHABLE_KEY: string;
}

function getBearerFromQuery(url: URL): string | null {
  const t = url.searchParams.get("token");
  return t && t.trim().length > 0 ? t : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenSubject(token: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const sub = JSON.parse(atob(part)).sub;
    return typeof sub === "string" && UUID_RE.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

// A socket for a room is only for that room's active participants. Checking
// that the token was valid (as before) let any signed-in user subscribe to
// any room, DMs included, and read its messages live.
//
// The check asks the project's own PostgREST with the caller's token, which
// verifies the signature and expiry (asymmetric or HS256 alike, and Silo
// sessions minted by authenticate-hub-user, which have no auth.users row)
// and applies the room_participants RLS.
async function isActiveRoomMember(token: string, roomId: string, env: Env): Promise<boolean> {
  const sub = tokenSubject(token);
  if (!sub || !UUID_RE.test(roomId)) return false;

  const query = new URLSearchParams({
    select: "room_id",
    room_id: `eq.${roomId}`,
    user_id: `eq.${sub}`,
    status: "eq.active",
    limit: "1",
  });
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/room_participants?${query}`, {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
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

    // 1) Handle programmatic POST broadcasts from your backend
    if (request.method === "POST") {
      const providedKey = request.headers.get("X-DO-Access-Key") ?? "";
      if (!this.env.DO_SECRET_KEY || !timingSafeEqual(providedKey, this.env.DO_SECRET_KEY)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const payload = await request.json();
      this.broadcastToAll(JSON.stringify(payload));
      return new Response("Broadcasted", { status: 200 });
    }

    // 2) Handle WebSocket Upgrades
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const token = getBearerFromQuery(url);
    if (!token) {
      return new Response("Missing authentication token", { status: 401 });
    }

    const roomId = url.pathname.split("/")[2] ?? "";
    if (!(await isActiveRoomMember(token, roomId, this.env))) {
      return new Response("Unauthorized, expired, or not a member of this room", { status: 401 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    this.ctx.acceptWebSocket(server, ["hub-member"]);
    
    return new Response(null, { status: 101, webSocket: client });
  }

  // ==============================================================
  // ⚡ HIBERNATION API: These methods wake up the DO automatically
  // ==============================================================

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {
    // Clients only listen. Everything in a room comes from the backend's
    // authenticated POST broadcasts (send-message, normsar-ai), which have
    // already been checked and stored. Relaying client frames let any
    // connected socket push fake NEW_MESSAGE / EDIT_MESSAGE / DELETE_MESSAGE
    // events into everyone else's view, so they are ignored.
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Broadcast user disconnect notification to all remaining members
    this.broadcastToAll(JSON.stringify({ 
      type: "user_left",
      timestamp: Date.now() 
    }));
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("WebSocket error:", error);
  }

  // ==============================================================
  // Utilities
  // ==============================================================

  broadcastToAll(message: string | ArrayBuffer) {
    for (const connection of this.ctx.getWebSockets("hub-member")) {
      try {
        connection.send(message);
      } catch (_) {}
    }
  }
}
