-- Bench photos are uploaded by staff from the dashboard and served publicly.
-- Only accept reasonably sized images in the bucket.
update storage.buckets
set file_size_limit    = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'bench-photos';
