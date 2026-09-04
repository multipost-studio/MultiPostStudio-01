# Integrations roadmap

Comparison against Buffer's 24-integration list, filtered to **free to add**
(no paid API tier, no paid developer account). Ordered by value ÷ effort.

## Already shipped

- [x] **Bluesky** — connect + publish + metrics + inbox + reply (app password, zero config)
- [x] **Facebook** — OAuth + publish (text/photo/multi-photo/video) + insights + comments + reply
- [x] **Instagram** — OAuth + publish + insights + comments + reply
- [x] **Threads** — OAuth (own app) + publish + insights + replies + reply
- [x] **YouTube** — OAuth + video upload + stats + comments + reply
- [x] **Webhooks** — outbound events to any endpoint (`/settings/api`)
- [~] **LinkedIn** — publish code ready; needs a LinkedIn Company Page + app (free)
- [~] **X / Twitter** — publish code ready; needs a **paid** dev account ($100/mo) → not free, parked

---

## Tier 1 — free API, high value

Media pickers surface in the Composer's "Add from library" modal next to the
new Upload button; each is an OAuth connect on `/integrations` plus a file
browser.

- [x] **Unsplash** — stock photo search + one-click insert (composer tab + media
      library button). `UNSPLASH_ACCESS_KEY`. Shipped in `19f4657`.
- [ ] **Google Drive** — file picker. Reuses the existing Google OAuth client;
      add `drive.readonly` scope + Drive Picker. Free.
- [ ] **Google Photos** — photo picker via Photos Library API. Same Google client,
      add the photoslibrary.readonly scope. Free.
- [ ] **Dropbox** — file picker. Dropbox App Console (free), OAuth2 + `/2/files/list_folder`
      + temporary links. Free.
- [ ] **OneDrive** — file picker via Microsoft Graph. Azure app registration (free),
      `Files.Read` scope, Graph `/me/drive`. Free.
- [ ] **Canva** — "import a design". Canva Connect API (free), OAuth + design export
      to PNG/JPG → registerMedia. Free.
- [ ] **Bitly** — shorten links in post bodies on publish, track clicks. Free tier
      (limited monthly). OAuth + `/v4/shorten`. Small.

## Tier 2 — automation, near-zero effort (Webhooks already exist)

These need docs + recipe templates, not new code. Optionally publish a first-party
app later (each platform's app review is free).

- [ ] **Zapier** — document the outbound webhook triggers + an inbound "create draft"
      webhook. Later: submit a Zapier integration (free review).
- [ ] **Make** — same webhook pattern + a shared scenario blueprint.
- [ ] **n8n** — same; n8n is free/self-hosted, HTTP Request + Webhook nodes.
- [ ] **Microsoft Power Automate** — same; custom connector from an OpenAPI spec.

Prereq for all four: an **inbound** webhook/API endpoint that creates a draft or
schedules a post (we only have outbound today). One small endpoint unlocks all of them.

## Tier 3 — AI / agent surface (free to build)

- [ ] **MCP server for MultiPost Studio** — one Model Context Protocol server exposing
      `create_draft`, `schedule_post`, `list_queue`, `get_analytics`, `reply_inbox`.
      Covers Buffer's **Claude**, **ChatGPT/Codex**, and **Cursor** entries in a single
      build. Free. Auth via a workspace API key.
- [ ] **Raycast extension** — thin client over the same API/MCP. Free to publish to the
      Raycast store.

## Tier 4 — bring-your-own-key / optional

- [ ] **OpenAI** — add as an alternative text-generation provider alongside Anthropic
      (`ai.ts` adapter). User supplies their own key; usage is on them. Small.
- [ ] **WordPress** — publish long-form posts to a self-hosted or wordpress.com site
      via the REST API + application password (free). Medium.
- [ ] **Evergreen Content Poster equivalent** — we already have recycling rules; extend
      to auto-reshare top posts on a schedule. No external dependency.

---

## Skip — not free / not applicable

| Buffer integration | Why skip |
|---|---|
| Feedly | API is paid for the tiers we'd need |
| Perplexity Web | API is paid |
| Quuu | Paid product, no free API |
| IFTTT | Building an IFTTT service needs partner approval; friction not worth it |
| Nelio Content / WriteStack / Google's own tools | WordPress/Substack plugins that integrate *into* a tool, not us calling out |

---

## Suggested order

1. **Unsplash** (1–2 h, immediate composer value)
2. **Inbound "create draft" API endpoint** (unlocks Zapier/Make/n8n/Power Automate at once)
3. **Google Drive + Google Photos** (one OAuth client, two pickers)
4. **Dropbox + OneDrive** (same picker pattern)
5. **MCP server** (Claude/ChatGPT/Cursor in one)
6. **Canva**, then **Bitly**, then **OpenAI provider**, then **WordPress**
