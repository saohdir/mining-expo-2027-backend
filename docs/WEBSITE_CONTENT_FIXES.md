# Website Content: publish/upload fixes, PDF downloads, block editor (Nov 2026)

## Why publishing and uploads sometimes failed

**Publishing: whether it worked depended on the item, the account and timing**

| Cause | When it happened | Fix |
|---|---|---|
| Publish rules: an item with an image needs alt text and image rights other than "Pending approval"; a download needs a file URL and file type. | Items with a photo but no alt text or rights failed; items without a photo worked. The error showed only as small grey text. | Each row lists what is missing ("To publish, add …"). Publish then opens the form and explains in a large message instead of failing. |
| Only **Super Admin** and **Content Editor** may change content. | Other roles saw the buttons but got 403. | Other roles see a read-only notice and no buttons. |
| CMS session expires after 12 h. | 401 response, no clear message. | "Session expired, sign in again". |
| Public content API cached for 30–60 s. | Published or edited changes appeared up to 1 minute later. | `Cache-Control: max-age=0, must-revalidate`. |

**Uploads: whether they worked depended on the order of filling and the file**

| Cause | Fix |
|---|---|
| Upload required alt text and rights first, but those fields are below the upload button; the file input was cleared silently. | Alt text and rights are optional at upload and checked at publish. |
| Alt text under 3 characters → validation error without a message. | Every error shows its message (or the field issues). |
| Files over 16 MB → nginx 413 HTML page → JSON parse error, nothing shown. | nginx allows 30 MB on the two upload routes. Sizes are checked in the browser with clear messages. |
| Images over 8 MB rejected; HEIC/GIF not accepted. | Limit raised to 12 MB (re-encoded to WebP). The message explains HEIC → JPG. |
| An uploaded image was only kept after "Save changes". | When editing an existing item, the uploaded image is saved to the item immediately. |
| Before the media volume (PR #31), uploads lived inside the container and disappeared on each redeploy. | Already fixed (`media_data` volume). |

## New
- **Downloads → Upload PDF**:
  - `POST /api/admin/files` takes a PDF of at most 25 MB and checks the `%PDF-` header. Access: Super Admin and Content Editor; uploads are audited as `FILE_UPLOADED`.
  - The upload fills in the URL, file type, size and title.
  - The file is served from `/api/public/media/<uuid>.pdf` inline, with `Content-Security-Policy: sandbox`.
- **News → block editor (Gutenberg-style)**:
  - Block types: paragraph, heading H2/H3, bulleted or numbered list, quote with source, image with caption, button, divider.
  - Each block can be moved, duplicated or deleted.
  - Edit and Preview tabs.
  - Keyboard:
    - Enter starts a new block; Shift+Enter adds a line break.
    - `/` opens the block menu.
    - `## `, `### `, `- `, `1. ` and `> ` convert the block.
    - Ctrl+B / Ctrl+I for bold and italic, plus a link button.
  - Stored as `{"format":"blocks","v":1,"blocks":[…]}` in `ContentItem.body` and validated on the server (safe URLs only).
  - Older plain-text articles still render on the website and convert to blocks when opened in the editor.
  - Rendering: the website (`assets/news.js`, frontend repo) renders the blocks. The CMS preview uses `renderBlocksHtml` (`src/lib/content-blocks.ts`) with the same markup.

No database migration. Deploy backend and frontend together (the frontend renders the new article format); `deploy/nginx.conf` changed, and `scripts/deploy-uat.sh` already restarts `web`.

## Delete instead of archive (follow-up)
- Every item has **Delete** in place of Archive. A warning modal says what disappears from the website; the reason is optional and Esc cancels.
- `DELETE /api/admin/content/[id]` (Super Admin and Content Editor) removes the item permanently. The audit log `CONTENT_DELETED` keeps a snapshot (kind, locale, slug, title, status, URLs) and the reason.
- `PATCH status: "ARCHIVED"` is no longer accepted. Items archived earlier still show in the list and can be published again or deleted.
- Uploaded files stay in the media store, because an English and a 中文 version can share the same image.
