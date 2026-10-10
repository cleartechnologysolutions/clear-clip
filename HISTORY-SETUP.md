# Clip Build 15 — clipboard history

Deploy this complete source package over the existing Clip repository using the existing build/deploy commands. Keep DB and CLIP_IMAGES bindings and your existing ADMIN_PASSWORD secret. History tables and indexes are created automatically on first use.

1. Open `/admin` and unlock it.
2. Use **Clipboard history boards** to create `adam`, `alicia`, or another board name.
3. Copy the board link and paste it into Clip Tray 1.2.0. A history link looks like `https://cl1p.xyz/history/adam`.
4. Start syncing, copy some text, then open the link. Refreshing keeps the saved history.

Each board stores its own latest 100 text/image captures. Numbering keeps increasing. Deleting a history board removes its entries and stored images. Deleting all regular clipboards does not delete history boards.

The existing R2 bucket is reused with a separate `history/` prefix. History images do not expire by age in the app; ensure any bucket-wide lifecycle rule does not delete that prefix prematurely. Old images are removed as entries leave the retained 100.

Anyone with a board link can view and append captures. Board creation and deletion require the admin password. History boards are separate from regular Clip boards; old content is not imported automatically.

The page fetches the latest number first and only reads the full history if it has changed, avoiding repeated full-history reads during idle viewing.
