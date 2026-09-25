# Clip Build 11 — image paste

1. In Cloudflare → R2, create a private bucket named **clip-images**. Keep public access off.
2. On that bucket's Settings → Object lifecycle rules, add a rule for prefix `clips/` that deletes objects **1 day after upload**. The app hides images after exactly 24 hours; this rule physically cleans up expired objects (Cloudflare cleanup can happen later).
3. Upload this package's contents into your existing Clip repository and commit. Keep your existing build and deploy commands. No D1 migration is needed.
4. The included vite.config.ts adds the R2 binding **CLIP_IMAGES** pointing at **clip-images** to the generated deployment config. Preserve any custom DB settings you already use. Do not delete your Worker or database.
5. After deployment, reload the app and look for **Build 11**. Paste a screenshot, or use Choose image. It uploads immediately; text still needs Save. Another person clicks Refresh to see it.

PNG, JPEG, WebP, GIF; maximum 10 MiB (displayed as 10 MB). Original bytes are kept: no resizing or compression. One image per code; uploading another replaces it. Click the preview to enlarge. Remove image leaves text alone. Clear removes both; admin Delete all also deletes images. Anyone who has the code can view or replace its image, just like its text.

Refresh only reads data. Unsaved text and the existing separate remote-text panel retain their Build 10 behavior. A failed image refresh keeps the current preview. A successful refresh of a removed/expired image removes that preview; it never changes your text.

If images say storage is not configured, check Worker → Bindings for CLIP_IMAGES (R2 bucket clip-images). Create the bucket before redeploying.
