import { DurableObject } from "cloudflare:workers";

export interface Env {
  CHAT_ROOM_DO: DurableObjectNamespace;
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
