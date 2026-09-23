-- Photos and messages about a bench, sent by adopters or visitors, handled by
-- staff in one inbox instead of over email.
--
-- Flow: the browser uploads photos to the private submission-photos bucket
-- (anyone may upload, only staff may view), then calls submit_bench_message()
-- with the uploaded paths. Staff read, annotate and resolve submissions, and
-- may copy a photo into the public bench-photos bucket.

create type public.submission_topic as enum (
  'bench_photo',  -- a photo of the bench / its surroundings
  'plaque',       -- plaque installed, needs fixing, text change
  'damage',       -- repair or maintenance needed
  'question'      -- anything else
);

create type public.submission_status as enum ('new', 'in_progress', 'resolved');

create table public.bench_submissions (
  id            bigint generated always as identity primary key,
  bench_id      bigint not null references public.benches (id) on delete cascade,
  topic         public.submission_topic not null,
  message       text,
  contact_name  text not null,
  contact_email text not null,
  photo_paths   text[] not null default '{}',   -- object names in submission-photos
  status        public.submission_status not null default 'new',
  staff_notes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint submissions_message_len check (char_length(message) <= 2000),
  constraint submissions_name_len check (char_length(contact_name) between 1 and 120),
  constraint submissions_email_format check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint submissions_max_photos check (cardinality(photo_paths) <= 5),
  constraint submissions_has_content check (cardinality(photo_paths) > 0 or char_length(message) > 0)
);

create index bench_submissions_bench_idx on public.bench_submissions (bench_id);
create index bench_submissions_status_idx on public.bench_submissions (status);

create trigger bench_submissions_touch before update on public.bench_submissions
  for each row execute function public.touch_updated_at();

-- Contact details and unreviewed photos: staff only.
alter table public.bench_submissions enable row level security;
create policy bench_submissions_staff_all on public.bench_submissions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.bench_submissions from anon;

-- ---------------------------------------------------------------------------
-- Private photo bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-photos', 'submission-photos', false, 8 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Anyone may upload new files under uploads/ (no overwrite: no update policy),
-- but nobody except staff can list, view or delete them.
create policy submission_photos_public_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'submission-photos' and name like 'uploads/%');

create policy submission_photos_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-photos' and public.is_staff());

create policy submission_photos_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'submission-photos' and public.is_staff());

-- ---------------------------------------------------------------------------
-- Public write API
--   POST /rest/v1/rpc/submit_bench_message
-- ---------------------------------------------------------------------------

create function public.submit_bench_message(
  p_bench_id      bigint,
  p_topic         public.submission_topic,
  p_contact_name  text,
  p_contact_email text,
  p_message       text   default null,
  p_photo_paths   text[] default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[] := coalesce(p_photo_paths, '{}');
  v_id    bigint;
begin
  if coalesce(trim(p_contact_name), '') = '' then
    raise exception 'Your name is required' using errcode = '22023';
  end if;
  if coalesce(trim(p_contact_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required' using errcode = '22023';
  end if;
  if cardinality(v_paths) = 0 and coalesce(trim(p_message), '') = '' then
    raise exception 'Add a photo or a message' using errcode = '22023';
  end if;
  if cardinality(v_paths) > 5 then
    raise exception 'Up to 5 photos per message' using errcode = '22023';
  end if;
  if not exists (select 1 from public.benches where id = p_bench_id) then
    raise exception 'Bench % does not exist', p_bench_id using errcode = 'P0002';
  end if;

  -- Light abuse guard.
  if (select count(*) from public.bench_submissions
      where lower(contact_email) = lower(trim(p_contact_email))
        and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many messages from this email today; please try again tomorrow'
      using errcode = '22023';
  end if;

  -- Every photo must be a file just uploaded to the private bucket and not
  -- already attached to another submission.
  if exists (
    select 1 from unnest(v_paths) as p(path)
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'submission-photos'
        and o.name = p.path
        and o.name like 'uploads/%'
        and o.created_at > now() - interval '1 day'
    )
    or exists (
      select 1 from public.bench_submissions s where p.path = any (s.photo_paths)
    )
  ) then
    raise exception 'One of the photos could not be found; please upload it again'
      using errcode = '22023';
  end if;

  insert into public.bench_submissions (bench_id, topic, message, contact_name, contact_email, photo_paths)
  values (p_bench_id, p_topic, nullif(trim(p_message), ''), trim(p_contact_name),
          lower(trim(p_contact_email)), v_paths)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_bench_message(bigint, public.submission_topic, text, text, text, text[]) from public;
grant execute on function public.submit_bench_message(bigint, public.submission_topic, text, text, text, text[]) to anon, authenticated;
