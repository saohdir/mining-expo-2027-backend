# Event Highlight gallery (/highlights/)

CMS → **Event Gallery** (`/admin/gallery`; edit: Super Admin, Content Editor; others read-only).
- **Years** = the buttons on the page. Add a year, rename its button, show/hide it, delete it when empty.
  A year appears on the website only while it is shown **and** has published items. Newest year is selected by default.
- **Upload**: drag & drop several photos/videos (photos ≤ 30 MB: JPG/PNG/WebP/HEIC; videos ≤ 600 MB: MP4/MOV/WebM/MKV/AVI).
  - Photos are compressed at once: WebP, longest side 2000 px, EXIF removed, plus a 600×450 thumbnail.
  - Videos are compressed by the worker in the background (H.264/AAC MP4, longest side 1280 px, CRF 28, fast-start) with a poster
    image; the original is deleted afterwards. Status “Compressing…” → ready (or “Compression failed” → Retry).
- **Publish** needs: compression finished, an English description (alt text), and an approved rights status. Optional: titles,
  captions and descriptions in 中文 (English is used when empty). Order number, move to another year, unpublish, delete.
- Website: 12 items per page, pagination (`?year=&page=`, Back/Forward), lightbox for photos and videos (keyboard, swipe), 中文.

Technical: tables `GalleryYear`, `GalleryItem` (migration `20261119010000_event_gallery`); files in `MEDIA_UPLOAD_DIR/gallery`
(Docker volume `media_data`, shared by app and worker); public files via `/api/public/gallery-media/<key>` (published only; drafts for
signed-in staff; byte ranges for video); upload route `/api/admin/gallery/upload` streams the body to disk (nginx: 600 MB, no buffering);
ffmpeg is installed in the app image.
