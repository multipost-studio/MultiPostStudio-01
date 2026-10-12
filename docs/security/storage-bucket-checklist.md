# Storage: what the code does and what to check on the live bucket

Uploaded media (images, video, documents) goes to one S3-compatible bucket (Supabase Storage, R2 or S3), configured by `S3_BUCKET`, `S3_ENDPOINT`, `S3_PUBLIC_URL`. Social networks fetch media from a public URL, so objects are served publicly. Their addresses are not guessable. The bucket's own settings are not in the repository, so they have to be checked on the live project.

## What the code guarantees (since 2026-10-12)

- **Per-workspace prefix.** New objects are stored at `uploads/<workspaceId>/YYYY/MM/<random uuid>.<ext>`. Objects from before this change keep their old `uploads/YYYY/MM/...` keys and keep working.
- **Server-chosen keys.** The key is never taken from the browser. The extension comes from the verified file type, not the file name. Presigned uploads are bound to the declared size and expire after 10 minutes.
- **Registering a file checks the prefix.** `registerMediaAction` refuses an object whose key names a different workspace, and still refuses any object that another asset already references. Knowing another tenant's file address is not enough to add that file to your own library.
- **Thumbnails** now follow the same layout and have random names (they used to be `thumbnails/<timestamp>-<file name>.webp`, which could be guessed and was never cleaned up). Deleting an asset can find and remove its thumbnail.
- **Image proxy** (`/api/media/[id]/raw`) serves only assets of the caller's active workspace, and only from our own storage host.

## What to check on the live bucket (read-only)

In the Supabase SQL editor (or the equivalent for R2/S3):

```sql
-- Is the bucket public, and are there limits?
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

-- Which API roles may do what on objects?
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects';
```

What good looks like:

| Check | Expected |
|---|---|
| Bucket visibility | Public **read** is acceptable (publishing needs it). |
| `anon` / `authenticated` can **list** objects | No. A public bucket serves files by URL without a list policy. |
| `anon` / `authenticated` can **insert, update or delete** | No policy at all for those roles. The app uploads with its own server credentials and presigned URLs, never with a user's Supabase token. |
| `allowed_mime_types` | Set to the types the app accepts (images, video, PDF) as a second line behind the app's own check. |
| `file_size_limit` | At or above the app's largest upload, not unlimited. |
| Credentials | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` are scoped to this bucket only, and rotated if they were ever shared. |

If the project does not use the Supabase Data API, the `storage` schema's API exposure matters less, but run the RLS lock-down migration and the checks in `rsla-audit-2026-10-12.md` (RSLA-01) as well.

## Private-bucket mode (optional, not enabled)

`presignDownload(key)` in `src/lib/adapters/storage.ts` already produces short-lived signed links. Switching to a private bucket means serving every asset through signed URLs. Publishing to Instagram, Facebook, LinkedIn and others needs a URL they can fetch at publish time, so this needs a design (a signed URL minted just before each publish). It is a product change, not a settings change, and is deliberately not done here.

## Housekeeping to consider

- A lifecycle rule that deletes objects under `uploads/<workspaceId>/` for a workspace that was deleted (the prefix makes this possible).
- Old objects without a workspace prefix can stay. They cannot be re-registered by another workspace while an asset references them.
