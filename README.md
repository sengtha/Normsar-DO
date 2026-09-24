# Normsar-DO

CloudFlare Durable Object for real-time chat room communication with Supabase authentication.

A production-ready WebSocket server built on Cloudflare Workers' Durable Objects, featuring:
- 🔐 Secure JWT authentication via Supabase
- 📡 Real-time WebSocket broadcasting
- 🔑 Flexible authentication (RS256/ES256 or HS256 fallback)
- 🛡️ Built-in security best practices
- ⚡ Zero-cold-start latency with Durable Objects

---

## Features

| Feature | Description |
|---------|-------------|
| **Room Auth** | A socket opens only for an active participant of that room, checked against the project's `room_participants` with the caller's own token |
| **WebSocket** | Real-time server-to-client delivery; frames sent by clients are ignored |
| **Broadcasting** | Send messages to all connected clients in a room |
| **Room-based** | Separate rooms identified by URL path (e.g., `/chat/room-123`) |
| **Server API** | POST endpoint for sending messages with API key authentication |
| **Production Ready** | HTTPS enforcement, rate limiting support, comprehensive logging |

---

## Quick Start

### 1. Prerequisites
- Node.js 18+ and npm/yarn/pnpm
- Cloudflare account with Workers enabled
- Supabase project (free tier works)

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/sengtha/Normsar-DO.git
cd Normsar-DO

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### 3. Configuration

Edit `.env.local`:

```bash
# 1. Generate a secure random key for POST authentication
DO_SECRET_KEY=$(openssl rand -hex 32)

# 2. Get your Supabase credentials from Dashboard > Settings > API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_public_key
```

### 4. Deploy

```bash
# Login to Cloudflare
npx wrangler login

# Deploy to production
npm run deploy

# Or deploy to staging
npm run deploy:staging
```

---

## Configuration

### Wrangler Setup (`wrangler.toml`)

```toml
name = "normsar-do"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[durable_objects]
bindings = [
  { name = "CHAT_ROOM_DO", class_name = "ChatRoomDO" }
]

[[migrations]]
tag = "v1"
new_classes = ["ChatRoomDO"]

[env.production]
routes = [
  { pattern = "api.example.com/chat/*", zone_name = "example.com" }
]
```

### Environment Secrets

Set secrets using Wrangler:

```bash
# Development
npm run dev:secret DO_SECRET_KEY "$(openssl rand -hex 32)"
npm run dev:secret SUPABASE_URL "https://your-project.supabase.co"
npm run dev:secret SUPABASE_PUBLISHABLE_KEY "your_public_key"

# Production
npm run secret DO_SECRET_KEY "$(openssl rand -hex 32)"
npm run secret SUPABASE_URL "https://your-project.supabase.co"
npm run secret SUPABASE_PUBLISHABLE_KEY "your_public_key"
```

Or use Wrangler directly:

```bash
wrangler secret put DO_SECRET_KEY --env production
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_PUBLISHABLE_KEY --env production
```

---

## Usage

### WebSocket Client

```typescript
// Connect to a chat room with authentication token
const token = "your_supabase_access_token";
const ws = new WebSocket(`wss://api.example.com/chat/room-123?token=${token}`);

ws.onopen = () => {
  console.log("Connected!");
  ws.send(JSON.stringify({ type: "message", text: "Hello!" }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  console.log("Disconnected");
};
```

### Server-Side Broadcasting

```bash
curl -X POST https://api.example.com/chat/room-123 \
  -H "X-DO-Access-Key: $DO_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notification",
    "text": "Admin message to all users"
  }'
```

---

## API Reference

### WebSocket Endpoint

**URL**: `wss://api.example.com/chat/{roomId}?token={supabaseToken}`

**Authentication**: Bearer token in query parameter (required)

**Connection Response**:
- `101 Switching Protocols` - Connection established
- `401 Unauthorized` - Invalid, expired or missing token, or not an active member of the room
- `426 Upgrade Required` - Request wasn't a WebSocket upgrade

**Message Format**:
```json
{
  "type": "message",
  "text": "User message content",
  "timestamp": "2026-04-30T12:00:00Z"
}
```

### POST Endpoint (Server Broadcasting)

**URL**: `https://api.example.com/chat/{roomId}`

**Method**: `POST`

**Headers**:
```
X-DO-Access-Key: {DO_SECRET_KEY}
Content-Type: application/json
```

**Request Body**:
```json
{
  "type": "admin",
  "text": "Message for all connected users"
}
```

**Response**:
- `200 OK` - Message broadcasted
- `401 Unauthorized` - Invalid API key
- `400 Bad Request` - Missing room ID
- `405 Method Not Allowed` - Wrong HTTP method

---

## Error Responses

| Status | Meaning | Example |
|--------|---------|---------|
| `400` | Missing room ID | `{"error": "Missing Room ID"}` |
| `401` | Authentication or room membership failed | `Unauthorized, expired, or not a member of this room` |
| `426` | Not a WebSocket upgrade | `{"error": "Expected websocket"}` |
| `500` | Server error | Internal server error |

---

## Security Considerations

### ✅ Authentication
- A WebSocket connection requires a Supabase token of an **active participant of that room**.
  The DO asks the project's PostgREST (`SUPABASE_URL`) for the caller's own
  `room_participants` row using the caller's token, so PostgREST verifies the
  signature and expiry and RLS applies. This works for Hub tokens and for Silo
  sessions minted by `authenticate-hub-user`.
- For a Silo's own DO, set `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` to that
  Silo's URL and key, not the Hub's.
- Clients only listen. Messages reach a room only through the POST endpoint
  (the backend, after it has checked and stored them); frames sent by clients
  are dropped so nobody can inject fake events into others' views.
- POST requests require the `X-DO-Access-Key` header (compared in constant time).

### ✅ HTTPS Requirement
- **Production**: API key header transmitted only over HTTPS
- **Development**: Use `http://localhost:8787` for local testing

### ✅ Supabase RLS
- Always enable Row Level Security (RLS) on your Supabase tables
- Configure policies to match your authorization model
- Example: Users can only see messages in rooms they're members of

