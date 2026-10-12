# Pinterest integration

What it does: connects a Pinterest account by OAuth, publishes image Pins, carousel Pins (2 to 5 images) and video Pins to a chosen board, and pulls Pin analytics (impressions, saves, clicks, video views) back into Analytics.

**Status:** built against Pinterest API v5 and covered by unit tests with mocked responses. It has **not been run against a live Pinterest app**. Do a sandbox run (below) before relying on it.

## 1. Create the Pinterest app

1. Sign in at <https://developers.pinterest.com/apps/> and create an app.
2. Add the redirect URI: `https://<your-domain>/api/oauth/pinterest/callback`
   (`OAUTH_REDIRECT_BASE`, if set, replaces the domain). Add `http://localhost:3000/api/oauth/pinterest/callback` for local work.
3. Copy the app id and secret into the environment:

| Variable | Value |
| --- | --- |
| `OAUTH_PINTEREST_CLIENT_ID` | App id |
| `OAUTH_PINTEREST_CLIENT_SECRET` | App secret |
| `PINTEREST_SANDBOX` | `true` to use `api-sandbox.pinterest.com` (optional) |

Scopes requested: `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`.
An account connected before `boards:write` was requested must be reconnected to create boards from Integrations.

## 2. Access level

The MultiPost Studio app already has **Standard access** (confirmed in the Pinterest developer portal), so it can create real, public Pins. Leave `PINTEREST_SANDBOX` unset in production; set it to `true` only to point at the sandbox API with a sandbox-only app.

A new Pinterest app starts with Trial access, where Pins can only be created through the sandbox. Without Standard access Pinterest refuses publish calls, and the app shows "Pinterest hasn't approved this app for full access yet…" instead of the raw response.

Secret boards are not supported: that needs the extra scopes `boards:read_secret`, `boards:write_secret` and `pins:write_secret`, which are not requested. Only public boards are listed and created.

## 3. How a Pin is built

| Post setting | Pinterest field |
| --- | --- |
| Pinterest board (composer) | `board_id`. Falls back to the account default (Integrations → Manage boards), then to the first board |
| Pin title (composer, optional) | `title`, max 100. Otherwise the first line of the text |
| Text | `description`, max 800 |
| Destination link (composer) | `link`, must be `https` |
| Media alt text | `alt_text`, max 500 |
| 1 image | `image_url` |
| 2–5 images (Carousel Pin) | `multiple_image_urls` |
| 1 video (Video Pin) | `video_id` after upload + processing. The first attached image, if any, is the cover |

Video Pins: MP4 or MOV, 4 s to 15 min, up to 128 MB here. The file is uploaded to the storage Pinterest hands out, then Pinterest processes it. If processing is still running after about 25 s the publish is retried automatically and **does not upload the file again** (the media id is saved with the post).

## 4. Where users manage it

- **Integrations → Pinterest account → Manage boards:** list boards, choose the default, create a public board.
- **Composer → Pinterest channel:** board, title and destination link for that post.
- Only members with `channels.connect` can change the default board or create boards; `content.create` can list them.

## 5. Analytics

The social-sync job (runs from `/api/cron/tick`) reads each published Pin's analytics for the last 14 days (60 days every sixth hour). Likes and comments are not available from this API and stay 0. Clicks are Pin clicks plus outbound clicks. If Pinterest rejects a metric for an account, the call retries with the three core metrics.

## 6. Testing in the sandbox

1. Set the three variables above with `PINTEREST_SANDBOX=true`, restart.
2. Connect Pinterest in Integrations, open Manage boards, create a board and make it the default.
3. Publish an image Pin, a carousel and a short video from the composer. Check each appears in the sandbox account.
4. Check a failure: use a link without `https` (it is dropped, the Pin still posts) and remove the board on Pinterest (the post fails with a message to pick another board).

## Known limits

- One request per Pin for analytics, capped at 200 Pins and 4 at a time per account per run.
- Only boards the signed-in Pinterest user owns or collaborates on are listed (first 250).
- Pinterest rate limits apply per app; a 429 is retried by the queue.
