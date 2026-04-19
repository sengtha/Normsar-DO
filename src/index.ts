import { DurableObject } from "cloudflare:workers";

export interface Env {
  CHAT_ROOM_DO: DurableObjectNamespace;
  DO_SECRET_KEY: string;
  SUPABASE_JWT_SECRET: string; // ⚡ ADD THIS to your Cloudflare Variables/Secrets
}

// Helper function to decode base64url safely
function base64UrlDecode(str: string) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

// Cryptographically verify the HS256 Supabase JWT
async function verifyJWT(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const encoder = new TextEncoder();
    
    // Import the secret key
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert signature from base64url to Uint8Array
    const signatureStr = base64UrlDecode(parts[2]);
    const signature = new Uint8Array(signatureStr.length);
    for (let i = 0; i < signatureStr.length; i++) {
      signature[i] = signatureStr.charCodeAt(i);
    }

    const data = encoder.encode(parts[0] + '.' + parts[1]);

    // Verify cryptographic signature
    const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!isValid) return false;

    // Verify expiration
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      console.warn("Token expired");
      return false;
    }

    return true;
  } catch (e) {
    console.error("JWT verification failed:", e);
    return false;
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
  }
};

export class ChatRoomDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "POST") {
      // 1. Extract the key from the request header
      const providedKey = request.headers.get("X-DO-Access-Key");
      
      // 2. Compare it to the environment secret
      if (providedKey !== this.env.DO_SECRET_KEY) {
        console.warn("Blocked unauthorized broadcast attempt");
        return new Response("Unauthorized", { status: 401 });
      }
      
      const payload = await request.json();
      this.broadcastToAll(JSON.stringify(payload));
      return new Response("Broadcasted", { status: 200 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    // 🔒 3. Extract and Verify the JWT from the query string
    const token = url.searchParams.get("token");
    if (!token) {
      console.warn("Missing connection token");
      return new Response("Missing authentication token", { status: 401 });
    }

    if (!this.env.SUPABASE_JWT_SECRET) {
      console.error("Missing SUPABASE_JWT_SECRET in Cloudflare environment");
      return new Response("Server configuration error", { status: 500 });
    }

    const isTokenValid = await verifyJWT(token, this.env.SUPABASE_JWT_SECRET);
    if (!isTokenValid) {
      console.warn("Invalid or expired connection token");
      return new Response("Unauthorized or Expired Token", { status: 401 });
    }

    // 4. Upgrade connection ONLY if token is mathematically valid
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastToAll(messageString: string) {
    const allConnectedUsers = this.ctx.getWebSockets();
    for (const connection of allConnectedUsers) {
      try { connection.send(messageString); } catch (err) {}
    }
  }
}
