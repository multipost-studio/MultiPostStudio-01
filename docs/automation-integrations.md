# Zapier / Make / n8n / Power Automate

MultiPost Studio already has a real, authenticated public API — `/api/v1` —
that these tools can call directly today. No new integration to build; this
is the setup recipe.

## 1. Get an API key

**Settings → API & Webhooks → API keys → Create key.** Scopes: `posts:write`
(and `posts:read` if the tool needs to check status). Copy the key — shown
once, format `mps_live_...`.

## 2. The endpoint

```
POST https://multipost-studio.vercel.app/api/v1/posts
Authorization: Bearer mps_live_...
Content-Type: application/json

{
  "workspaceId": "cljk...",
  "title": "Optional internal title",
  "scheduledAt": "2026-09-10T14:00:00Z",   // omit to create a draft instead
  "channels": [
    { "channelId": "cljk...", "body": "Post text for this channel" }
  ]
}
```
Find `workspaceId` and each `channelId` via `GET /api/v1/channels` (same auth).
Response: `201` with the created post, or a `4xx` with a plain-text reason in
`error`.

## 3. Zapier

Action: **Webhooks by Zapier → Custom Request**
- Method: `POST`
- URL: `https://multipost-studio.vercel.app/api/v1/posts`
- Headers: `Authorization: Bearer mps_live_...`
- Data (raw JSON): the body above, with fields mapped from the trigger step

## 4. Make (Integromat)

Module: **HTTP → Make a request**
- Method `POST`, URL as above
- Headers: `Authorization: Bearer mps_live_...`, `Content-Type: application/json`
- Body type: raw JSON, map fields from the previous module

## 5. n8n

Node: **HTTP Request**
- Method `POST`, URL as above
- Authentication: Generic Credential Type → Header Auth →
  Name `Authorization`, Value `Bearer mps_live_...`
- Body: JSON, map fields with expressions from earlier nodes

## 6. Microsoft Power Automate

Action: **HTTP** (Premium connector) or build a **Custom Connector** from an
OpenAPI definition pointing at `/api/v1/posts` for a nicer designer
experience — ask if you want a ready-made OpenAPI spec generated.

## Notes

- `channelId`s must belong to the `workspaceId` in the same request — cross-workspace ids are rejected.
- Per-platform character limits are enforced server-side (matches what the composer shows).
- Media attachment isn't in this endpoint yet — posts created this way are text-only until that's added.
- `scheduledAt` in the past (more than 60s) is rejected; omit it for a draft you schedule later in the UI.
