# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in this project, please **do not** open a public GitHub issue. Instead:

1. **Email**: Send a detailed report to [sengtha@gmail.com](mailto:sengtha@gmail.com) with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

2. **Timeline**: We will acknowledge receipt within 48 hours and work to provide a fix or mitigation plan

3. **Disclosure**: Once a patch is released, you'll be credited for the discovery (unless you prefer anonymity)

---

## Authentication & Authorization

### JWT Verification
- **Primary Method**: RSA (RS256/ES256) via Supabase JWKS endpoint
- **Fallback**: HS256 validation via Supabase `/auth/v1/user` endpoint (legacy projects only)
- **Audience**: `authenticated` - required for all access tokens
- **Issuer**: Must match `{SUPABASE_URL}/auth/v1`

### API Access Control
- **POST Endpoint**: Requires `X-DO-Access-Key` header (shared secret)
- **WebSocket Endpoint**: Requires valid Bearer token in query parameter
- **Unauthorized Requests**: Return `401 Unauthorized` with minimal error details

### Supabase Integration
- **Public Key**: `SUPABASE_PUBLISHABLE_KEY` is intentionally public
- **Row Level Security (RLS)**: Critical for production deployments
  - Ensure RLS policies are configured in Supabase to restrict data access
  - Never rely solely on authentication without RLS policies

---

## Deployment Requirements

### ✅ HTTPS Enforcement
- **CRITICAL**: `X-DO-Access-Key` header must only be transmitted over HTTPS
- Unencrypted HTTP will expose the shared secret to network sniffing
- Configure Wrangler routes to enforce HTTPS in production

### Environment Secrets
- **Never commit** `.env` or `wrangler.toml` files with secrets
- Use Wrangler's secret management:
  ```bash
  wrangler secret put DO_SECRET_KEY --env production
  wrangler secret put SUPABASE_URL --env production
  wrangler secret put SUPABASE_PUBLISHABLE_KEY --env production
  ```
- Rotate secrets periodically (recommended: every 90 days)
- Keep a backup of old keys during rotation period

---

## Security Best Practices

### 1. Rate Limiting
Implement rate limiting to prevent brute-force attacks:
- Limit token validation attempts per IP/session
- Recommend CloudFlare's built-in rate limiting
- Monitor failed authentication attempts

### 2. Input Validation
- WebSocket messages should be validated before broadcasting
- Implement schema validation (e.g., Zod, Joi) for all POST payloads
- Sanitize data before storage or broadcast

### 3. WebSocket Security
- All WebSocket connections require valid authentication
- Consider message size limits to prevent memory exhaustion
- Implement connection timeouts to clean up idle connections
- Add per-connection message rate limiting

### 4. Logging & Monitoring
- Log all failed authentication attempts with timestamp and IP
- Monitor for unusual access patterns or token validation errors
- Enable CloudFlare Workers analytics and logging
- Alert on repeated failed auth attempts from same IP

### 5. Key Rotation
```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update in production (deployment blue-green recommended)
wrangler secret put DO_SECRET_KEY --env production

# 3. Keep old key for grace period (48 hours)
# 4. Remove old key after clients have reconnected
# 5. Document rotation in change logs
```

---

## Security Checklist (Pre-Deployment)

- [ ] Environment variables are set via Wrangler secrets, not in code
- [ ] HTTPS is enforced on all routes
- [ ] `X-DO-Access-Key` is randomly generated and strong (32+ chars)
- [ ] Supabase JWKS endpoint is accessible and responding
- [ ] Supabase RLS policies are configured for your data tables
- [ ] CloudFlare DDoS protection is enabled
- [ ] Rate limiting is configured (if using custom middleware)
- [ ] Audit logging is enabled for auth failures
- [ ] Team members have access to security contact email
- [ ] Secrets are rotated before first production deployment

---

## Known Limitations

1. **Shared Secret**: `X-DO-Access-Key` is a shared secret between your backend and this Worker
   - Compromise of this key requires full rotation
   - Consider IP whitelisting as additional layer

2. **Broadcast Model**: All authenticated users receive all WebSocket messages
   - Implement room-based or user-specific filtering if needed
   - Consider adding message ACLs in application logic

3. **Fallback Authentication**: HS256 fallback requires Supabase PUBLISHABLE_KEY
   - Only use for legacy projects that cannot upgrade to RS256
   - RS256 is recommended for new projects

---

## Dependency Security

- Keep `jose` library updated to latest version
- Regularly run `npm audit` to check for vulnerabilities
- Use Dependabot or similar tools for automated updates
- Review security advisories for Cloudflare Workers SDK

---

## Contact

For security questions or concerns:
- Email: [sengtha@gmail.com](mailto:sengtha@gmail.com)
- GitHub Issues: For non-security bugs only
- Do NOT post security vulnerabilities in public issues

---

**Last Updated**: 2026-04-30
