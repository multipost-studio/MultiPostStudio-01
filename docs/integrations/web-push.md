# Browser & phone notifications (Web Push) and the notification sound

People get a notification on their phone or computer when MultiPost Studio is **closed**, and a chime when it is open. It works in Chrome, Edge, Firefox, Samsung Internet, Safari 16.4+ and the installed app (PWA). On iPhone and iPad it only works once the app is on the Home Screen (Apple's rule).

**Status:** built and unit-tested (sender, rules, service worker, actions, settings). It has **not been run against a real push service** yet: do the checks at the end after you deploy.

## What it does

- A notification created anywhere in the app (failed or successful publishing, approvals, mentions, reminders, billing and security alerts, and so on) is also pushed to every device the person turned notifications on for. It uses the same notification system as the bell, so the bell, email and push always agree.
- Tapping it opens the right page (the post, the inbox, billing). If the app is already open it is brought forward and moved there.
- The unread count appears on the installed app's icon.
- If the app is open and in front, the person gets the toast and the chime instead of a second system notification (iOS always shows one, because iOS withdraws permission from sites that don't).
- An open window refreshes its bell within a moment of a push, which is what makes the chime feel instant. The old 60-second check stays as a fallback.

## Settings people have (Settings → Notifications)

- **Turn on / off per device**, send a test, see and remove their devices (up to 10).
- **Master switch**, **minimum priority** (everything, normal and above, important only, critical only), **categories**.
- **Quiet hours** in their own timezone. Critical alerts still come through; everything is waiting in the bell.
- **Sound**: on/off, volume, a sample of the chime and of the critical alert.
- Required alerts (failed payments, security changes, a disconnected account) ignore the category and priority filters but follow the master switch and the person's own choice to turn pushes off.

## Setting it up (once)

1. Generate a key pair on your computer:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. In Vercel → Environments → Production add:

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the public key |
   | `VAPID_PRIVATE_KEY` | the private key (mark Sensitive) |
   | `VAPID_SUBJECT` | `mailto:you@yourdomain.com` (a contact the push services can reach) |

3. Apply the migration `20261013100000_web_push_subscriptions` (your build runs `prisma migrate deploy`), then redeploy.

Until both keys exist the feature is hidden: Settings shows "Browser notifications aren't available on this server yet" and nothing is sent. **Never change the key pair afterwards**: every device would have to turn notifications on again.

## How it is protected

- The server only ever sends to real push services (Google/FCM, Mozilla, Apple, Windows). A subscription pointing anywhere else is refused, so the endpoint cannot be used to make the server call internal addresses.
- A subscription belongs to one account. If someone signs in to a shared device, it moves to them and the previous account stops buzzing it.
- The payload is encrypted for the device. It carries only the notification's own title and text, a same-site link and the unread count. Links are checked twice (server and service worker): only a path on this site can be opened.
- Endpoints and keys never reach the browser after they are saved, and the table is locked from the Supabase API (see the RLS lock-down).
- A support administrator viewing as a customer cannot change that customer's devices.
- Sending never blocks or fails the thing that caused the notification: it runs after the response, errors are logged without the message text, dead devices are removed (404/410) and a device that keeps failing is dropped after 8 tries.

## Limits worth knowing

- Delivery is up to the push services. Phones in battery saver, a browser that was force-closed, or a device that has been off for days can delay or drop pushes. The bell always has everything.
- There is no push for notifications that exist only as in-app toasts, and no push to people who never turned a device on.
- Notification sound when the app is **closed** is chosen by the phone or computer, not by the app. The app only controls the chime while it is open. Browsers allow that sound only after the person has tapped or typed once on the page.

## Checking it after you deploy

1. Open Settings → Notifications on your phone (installed app) and on your computer. Tap **Turn on notifications on this device** and allow it. The status should read "On for this device".
2. Tap **Send a test**. Close the app first, and a notification should arrive within seconds.
3. Schedule a post a few minutes ahead and close the app: you should get "Published to ..." (or a failure alert) as a notification, and tapping it opens that post.
4. With the app open, trigger any notification and confirm you hear the chime and see the toast (no extra system notification).
5. Set quiet hours around now, send another event, and confirm it only appears in the bell.

If a device stays at "nothing delivered yet", it was probably blocked: check the browser's site settings for notifications, then turn notifications off and on again on that device.
