# Multi-frontend WeCom authentication

The backend owns WeCom secrets and registered auth clients. Each frontend uses
the WeCom login component with the matching public corporation and agent IDs.

## Browser flow

1. Initialize the WeCom frontend login component with its corporation, agent,
   callback, and frontend-managed state settings.
2. Receive the one-time WeCom authorization `code` in the frontend.
3. Exchange the code with `POST /auth/wecom/token`:

```json
{
  "clientId": "new-frontend",
  "code": "wecom-code"
}
```

4. The backend sets the JWT in the `auth_token` cookie. Configure Axios with
   `withCredentials: true`; do not store the token in Zustand or Web Storage.

The login response temporarily retains its `token` field for legacy clients
that send `Authorization: Bearer <token>`. Bearer takes precedence when both
transports are present.

## Browser session contract

- `auth_token` uses `HttpOnly; Secure; SameSite=Lax; Path=/` and expires after
  30 minutes.
- Active Cookie sessions rotate when less than 10 minutes remain.
- `GET /auth/me` restores display information and never returns a token.
- `POST /auth/logout` clears the Cookie.
- Cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests require an
  allowed `Origin` or `Referer`. Bearer-authenticated requests are exempt.
- Zustand stores only display information and loading state. Clear it after
  logout or an authenticated request returns `401`.

The supported client IDs are `legacy-frontend` and `new-frontend`. Their JWTs
have different audiences. A route intended for only one frontend must call
`authService.verifyToken(request, ["expected-client-id"])`.

## Deployment configuration

Copy the relevant structure from `wechat.example.json` into the ignored
`wechat.json`, then replace every secret placeholder. List every browser
origin exactly, including development origins, in the corresponding
`allowedOrigins` array. Credentialed CORS and CSRF checks use the union of
these lists. Empty lists no longer block startup, but browser credentialed
CORS and Cookie CSRF checks still need an exact origin for cross-origin
Cookie-based requests.

Origins can also be supplied through environment variables, which are appended
to `wechat.json`:

- `WECHAT_AUTH_ALLOWED_ORIGINS`: comma-separated or JSON array, shared by all
  auth clients.
- `WECHAT_AUTH_ALLOWED_ORIGINS_LEGACY_FRONTEND`: origins for `legacy-frontend`.
- `WECHAT_AUTH_ALLOWED_ORIGINS_NEW_FRONTEND`: origins for `new-frontend`.

Set a strong `JWT_SECRET` environment variable. Production startup fails when
it or either required auth client is missing.

`POST /auth/token` remains temporarily available for `legacy-frontend` and is
marked deprecated. It is scheduled to sunset on 2026-12-31.
