# Shareable without a watermark is the original's bytes

## Context

Gasten can download and share a photo at full resolution: the `shareable` variant, which is the original with the Galerij's watermark. The spec says "Gasten krijgen nooit de `original`-variant". When the Host turns the watermark off, `shareable` has no overlay, so rendering it would only re-encode the original's pixels at the same size. That costs a full-size decode and encode per photo (or per zip entry) and some quality, and the output is not meaningfully different.

Stored originals are already normalized when they are uploaded: EXIF orientation is applied, metadata (GPS included) is stripped, and they are resized to at most 2560 px.

## Decision

With the watermark off, `shareable` returns the stored original's bytes as they are, both for single downloads and in zip exports.

"Never the `original` variant" means that Gasten never get the Host's archive: photos without the watermark *the Host chose*, hidden photos, or anything before the Reveal. It does not require the bytes to differ from the original. Every other rule still applies: `shareable` reaches Gasten only after the Reveal, only for photos that are not hidden, and only through the `shareable` variant.

## Consequences

- With the watermark off, a Gast's download is identical to the Host's archive copy of that photo. Nothing leaks that the Galerij does not already show: metadata was removed when the photo was uploaded.
- With the watermark on, `shareable` always differs from the original. The test "Gasten krijgen nooit de `original`-variant" therefore runs with the watermark on.
- If originals are ever stored with metadata, or at a higher resolution than the Galerij should give out, this decision has to be revisited and `shareable` must be re-encoded every time.
