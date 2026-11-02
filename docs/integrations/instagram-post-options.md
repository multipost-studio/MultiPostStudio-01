# Instagram post options (collaborators, trial reels, music, location)

In the composer, an Instagram channel now has an **Instagram options** panel under the text. What it offers depends on how the account was connected.

**Status:** built, unit-tested and the production build passes. It has **not been run against Meta's live service**. The request fields come from Meta's documentation (IG User Media reference, Content Publishing guide, Instagram Audio API). Do the checks at the end after you deploy.

## What each option does

| Option | Formats | Instagram sign-in | Facebook sign-in | Sent to Instagram as |
|---|---|---|---|---|
| Collaborators (up to 3) | post, carousel, reel | yes | yes | `collaborators` |
| Share to feed | reel | yes | yes | `share_to_feed` |
| Trial reel (Manual / Auto) | reel | yes | yes | `trial_params.graduation_strategy` = `MANUAL` / `SS_PERFORMANCE` |
| AI-generated label | all | yes | yes | `is_ai_generated` |
| Music, with track and video volume | reel | **no** | yes | `audio_configuration` (from the Audio API's `ig_audio` search) |
| Location | post, reel, carousel | **no** | yes | `location_id` (a Facebook Page that has a location) |

Stickers, polls and Instagram's own effects are not available to any app through the API. That is Meta's limit, not ours.

## Two ways to connect Instagram

Music and location need the **Facebook** sign-in: Meta does not offer the Audio API on Instagram Login, and a location is a Facebook Page. So Integrations can offer both:

- **Connect Instagram** (when `OAUTH_INSTAGRAM_CLIENT_ID/SECRET` are set): signs in on instagram.com. No Facebook Page needed.
- **Connect Instagram through Facebook** (when `OAUTH_META_CLIENT_ID/SECRET` are set): signs in with Facebook. The account must be Business/Creator and linked to a Facebook Page. Unlocks music and location.

Set both pairs of variables to offer both. Reconnecting an account uses the way it was connected. For Instagram-Login accounts, the music and location rows explain how to switch.

## Safety

- Options are saved with the post's channel (no database change). Anything invalid is **dropped, never an error**: unknown usernames, a track id that isn't a number, Reel-only options on a post, music on an Instagram-Login account. A post always publishes without them, and the composer shows a short note about what was left out.
- Music uses API v22 for that one request, which is what Meta documents. Everything else stays on the current version.
- If Instagram rejects a Reel that has music or a trial setting, the error says what to do (remove the track, or publish as a regular Reel).
- Music and location searches check the account belongs to the workspace, are rate limited (30 a minute per account), and never run for Instagram-Login accounts.

## Limits worth knowing

- The music list is what Instagram authorizes for outside apps. It can differ from the app, and a track can disappear before a scheduled Reel goes out (the Reel then fails and the message says so). Music starts at the beginning of the track, and Instagram can't preview a Reel with its music.
- Trial reels need an account with enough followers. Instagram refuses them otherwise.
- Location search uses Meta's Pages search, which can require your Meta app to have "Page Public Metadata Access". If Meta refuses, the composer says so.

## Checking it after you deploy

1. Connect an Instagram Business/Creator account **through Facebook** (Integrations, Instagram, "Connect Instagram through Facebook").
2. Composer: pick that channel, choose **Reel**, add a video. Add a collaborator, a track (search, preview, pick), a location, and try Trial reel: Manual.
3. Publish now. Check the Reel on Instagram for the collaborator invite, the music and the location.
4. Repeat with an account connected through Instagram: collaborators, share to feed and trial reel should work, and music/location should show the reconnect hint.
5. If a step fails, the error carries Meta's reason. The usual causes: the app lacks the Audio API or Pages search access, the collaborator's account is private or can't be invited, or the account is too small for trial reels.
