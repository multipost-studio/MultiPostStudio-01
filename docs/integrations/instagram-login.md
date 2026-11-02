# Instagram Login (connect Instagram on instagram.com, not Facebook)

By default MultiPost Studio connects Instagram through **Facebook Login**: people see Facebook's sign-in and permission screens, and the Instagram account must be a Business/Creator account linked to a Facebook Page.

With **Instagram Login** switched on, "Connect Instagram" sends people to **instagram.com**, they sign in with their Instagram account, approve, and come back. No Facebook account or Page is involved.

**Status:** built and unit-tested (provider, redirect, code exchange, long-lived token, 60-day rotation, publishing/insights/comment/reply host selection). It has **not been run against Meta's live service**. Do the checks at the end after you set it up. The endpoints and permission names were written from Meta's documentation of "Instagram API with Instagram Login" and are the first thing to check if a step fails.

## It is opt-in

Nothing changes until both variables below are set. While they are unset, Instagram keeps connecting through Facebook exactly as before.

| Name | Value |
|---|---|
| `OAUTH_INSTAGRAM_CLIENT_ID` | the **Instagram app ID** (not the Meta app ID) |
| `OAUTH_INSTAGRAM_CLIENT_SECRET` | the **Instagram app secret** (mark Sensitive) |

## Setting it up (once)

1. developers.facebook.com → your app → **Add product → Instagram** → **API setup with Instagram login**.
2. Copy the **Instagram app ID** and **Instagram app secret** shown there into Vercel (Production) as the two variables above, then redeploy.
3. In the same screen, under **Set up Instagram business login**, add this as a valid OAuth redirect URI (exactly, no trailing slash):

   ```
   https://app.multipoststudio.online/api/oauth/instagram/callback
   ```

4. Permissions to request: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`.
5. While the app is in **Development mode**, only people with a role on the app (Admin/Developer/Tester, or an Instagram Tester you invite under App roles → Roles) can connect. To let anyone connect, submit these permissions for **App Review** and switch the app Live.

No database change is needed.

## What people see

- The Integrations screen says "You'll sign in on Instagram…" instead of mentioning Facebook.
- The account must be a **Business or Creator** (professional) Instagram account. A personal account can be switched in Instagram → Settings → Account type and tools. It does **not** need a Facebook Page.
- Each reconnect asks for sign-in again, so someone can switch to a different Instagram account.

## Offering both ways to connect

If you also keep the Meta app (Facebook Login) variables set, Integrations offers both: **Connect Instagram** (instagram.com) and **Connect Instagram through Facebook**. Reel music and location only work on the Facebook one, so people who want them use that link. See `docs/integrations/instagram-post-options.md`. Reconnecting an account uses the way it was connected.

## Existing connections

Accounts connected through Facebook before you turn this on **keep working unchanged**: each account remembers which way it was connected, and the app talks to the matching service (graph.facebook.com for Facebook-connected accounts, graph.instagram.com for Instagram-Login ones). To move an account over, open Integrations and reconnect it. Reconnecting the same handle replaces the old login.

## How it behaves

- The login lasts about 60 days. The app renews it in the background once it has under 7 days left. If Instagram rejects the renewal, the account shows "Reconnection Required"; a temporary Instagram outage does not disconnect anything.
- Publishing (photos, carousels, reels, stories), first comments, comment sync, comment replies and post insights all use the account's own service.
- Instagram has no "revoke access" call for this login. Disconnecting removes it from MultiPost Studio; the person can also remove the app under Instagram → Settings → Apps and websites.

## Checking it after you deploy

1. Set the two variables, redeploy, open Integrations → Instagram. The note should say you'll sign in on Instagram.
2. Connect with a Business/Creator account that has a role on the app. You should land on instagram.com, then return with the account shown as connected.
3. Publish a test post to it, then check the post on Instagram.
4. Reply to a comment from the Inbox.
5. If a step fails, the error message includes Meta's reason (`Graph … 400: …`). The usual causes: redirect URI not matching exactly, the person has no role on a Development-mode app, or a permission not yet approved.
