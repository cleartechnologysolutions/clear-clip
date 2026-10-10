# Clip Build 16 — clipboard history

Deploy this complete source package over the existing Clip repository using the existing build/deploy commands. Keep DB and CLIP_IMAGES bindings and your existing ADMIN_PASSWORD secret. History tables and indexes are created automatically on first use.

1. Open `/admin` and unlock it.
2. Use **Clipboard history boards** to create a board with a password of at least 12 characters. For existing boards, choose **Set password**; entries are retained. Existing boards are locked automatically until configured.
3. Copy both the board link and the upload key shown after setup into Clip Tray 1.3.0. The key is shown only once; use **New upload key** if it is lost. A history link looks like `https://cl1p.xyz/history/adam`.
4. Start syncing, copy some text, then open the link. Refreshing keeps the saved history.

Each board stores its own latest 100 text/image captures. Numbering keeps increasing. Deleting a history board removes its entries and stored images. Deleting all regular clipboards does not delete history boards.

The existing R2 bucket is reused with a separate `history/` prefix. History images do not expire by age in the app; ensure any bucket-wide lifecycle rule does not delete that prefix prematurely. Old images are removed as entries leave the retained 100.

A board password is required for history reads, including direct image URLs. An upload-only key is required to append captures. Board creation, password resets, key rotation and deletion require the admin password. Passwords use salted PBKDF2 hashes; keys and session tokens are stored as SHA-256 hashes. Browser sessions use Secure/HttpOnly/SameSite=Strict cookies, expire after 8 hours, and are revoked by password reset. Login is limited to 5 attempts per board/IP per 15 minutes, plus a shared board limit. Clip Tray protects its upload key with Windows DPAPI for the current user. History boards are separate from regular Clip boards; old content is not imported automatically.

The page fetches the latest number first and only reads the full history if it has changed, avoiding repeated full-history reads during idle viewing.
