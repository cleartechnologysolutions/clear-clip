# Clip — Build 11

Shared text and image clipboards with a separate URL for each code.

**Image setup: read IMAGE-SETUP.md before deploying.** Create the private R2 bucket `clip-images` and its one-day expiration rule. Images are shared immediately; text uses Save.

## Changes

- Removed company branding from the clipboard, admin page, and page title.
- Removed automatic refresh and the checkbox. Use the Refresh button.
- Refresh only reads saved data; it never saves, clears, or deletes anything.
- New saved text replaces an unchanged editor. If you have unsaved edits,
  your editor stays intact and newer saved text appears in a separate,
  read-only panel. Copy the parts you want into your draft and press Save.
- An empty/deleted remote board never blanks an existing local copy on refresh.
- Drafts are saved per code in this tab's session storage to survive a browser
  reload. If browser storage is unavailable/full, a warning tells you to keep
  the tab open until you save. Closing the tab can remove these local drafts.
- Delayed or failed refreshes cannot replace text for another code.
- Only the explicit Save and Clear buttons change shared text. The existing
  password-protected admin page and Delete all button remain available.

## Update your existing Cloudflare app

1. Extract this ZIP and upload its contents into the existing Clip GitHub repository.
2. Replace matching files and commit. Keep the existing Worker, custom domain,
   DB binding, and admin password; no database changes are needed.
3. Keep the existing build command: `chmod +x scripts/*.sh && npm run build`
4. Keep the deploy command: `npx wrangler deploy`
5. After deployment, reload each open Clip page once to load the new code.
   Copy any unsaved text somewhere safe before that first reload from the old app.
   The new page reads `Shared clipboards · Build 11`.

The database settings in vite.config.ts retain the previous package's defaults.
If you customized those values in your repository, keep your current values.

## Checks

`node --test tests/clip-session.test.mjs` verifies two-user updates, refreshes
with unsaved edits, browser reload draft recovery, empty remote boards, delayed
responses, failed reads, code switching, and explicit clearing. Use Node 24.

`npm run build` produces the Cloudflare Worker and browser assets.

After building, `node tests/images.integration.mjs` checks local D1/R2 uploads, size limits, text preservation, removal, clearing and authenticated admin deletion.
