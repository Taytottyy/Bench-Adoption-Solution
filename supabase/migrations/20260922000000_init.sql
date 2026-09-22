-- Van Cortlandt Park bench adoption: core schema.
--
-- Two tables are the single source of truth:
--   benches    one row per physical bench (location, label, condition)
--   adoptions  one row per adoption request/term for a bench
--
-- A bench's map status is never stored; it is derived from its adoptions
-- (see public.bench_map), so it can't drift out of date.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

-- Physical condition, set by staff. Independent of adoption.
create type public.bench_condition as enum (
  'active',       -- installed and adoptable
  'unavailable',  -- damaged, removed, reserved by the park, etc.
  'unsurveyed'    -- known to exist but location/details not yet verified
);

create type public.adoption_status as enum (
  'pending',    -- requested by a donor, awaiting staff review
  'approved',   -- confirmed by staff
  'rejected',   -- declined by staff
  'cancelled'   -- withdrawn or ended early
);

-- What the map shows. Mirrors the legend of Portland's Adopt-a-Bench map.
create type public.bench_map_status as enum (
  'available',
  'adopted',
  'pending',
  'unavailable',
  'unsurveyed'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.benches (
  id          bigint generated always as identity primary key,
  code        text not null unique,              -- plaque/inventory number, e.g. "VCP-0142"
  area        text,                              -- park section, e.g. "Parade Ground"
  lat         double precision not null,
  lng         double precision not null,
  condition   public.bench_condition not null default 'active',
  photo_path  text,                              -- object path in the bench-photos bucket
  notes       text,                              -- public notes (e.g. "faces the lake")
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Loose box around Van Cortlandt Park; catches swapped lat/lng and typos.
  constraint benches_lat_in_park check (lat between 40.870 and 40.920),
  constraint benches_lng_in_park check (lng between -73.910 and -73.855)
);

create index benches_area_idx on public.benches (area);

create table public.adoptions (
  id            bigint generated always as identity primary key,
  bench_id      bigint not null references public.benches (id) on delete restrict,
  status        public.adoption_status not null default 'pending',

  -- Public (shown on the map, subject to show_donor)
  donor_name    text not null,
  show_donor    boolean not null default true,   -- false => shown as "Anonymous"
  honoree       text,                            -- "In memory of ..." / "In honor of ..."
  plaque_text   text,

  -- Private (staff only)
  contact_email text not null,
  contact_phone text,
  staff_notes   text,

  -- Term: [starts_on, ends_on)
  starts_on     date not null,
  ends_on       date not null,

  reviewed_by   uuid references auth.users (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint adoptions_term_valid check (ends_on > starts_on),
  constraint adoptions_donor_name_len check (char_length(donor_name) between 1 and 120),
  constraint adoptions_honoree_len check (char_length(honoree) <= 120),
  constraint adoptions_plaque_len check (char_length(plaque_text) <= 200),
  constraint adoptions_email_format check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- The core guarantee: a bench can't have two live (pending or approved)
  -- adoptions whose terms overlap. Enforced by Postgres, not app code.
  constraint adoptions_no_overlap exclude using gist (
    bench_id with =,
    daterange(starts_on, ends_on, '[)') with &&
  ) where (status in ('pending', 'approved'))
);

create index adoptions_bench_idx on public.adoptions (bench_id);
create index adoptions_status_idx on public.adoptions (status);

-- Staff accounts (Supabase Auth users allowed to manage benches and adoptions).
create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger benches_touch before update on public.benches
  for each row execute function public.touch_updated_at();
create trigger adoptions_touch before update on public.adoptions
  for each row execute function public.touch_updated_at();

-- "Today" in the park's timezone, so terms roll over at local midnight.
create function public.park_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.benches   enable row level security;
alter table public.adoptions enable row level security;
alter table public.staff     enable row level security;

-- Benches hold no private data: anyone can read, only staff can write.
create policy benches_read on public.benches
  for select using (true);
create policy benches_staff_write on public.benches
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Adoptions contain contact details: staff only. The public reads adoption
-- info through bench_map(), and creates adoptions through request_adoption().
create policy adoptions_staff_all on public.adoptions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy staff_read_self on public.staff
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public read API: one row per bench with everything the map needs
--   GET /rest/v1/rpc/bench_map
--   GET /rest/v1/rpc/bench_map?status=eq.available&area=eq.Parade%20Ground
-- ---------------------------------------------------------------------------

create function public.bench_map()
returns table (
  id            bigint,
  code          text,
  area          text,
  lat           double precision,
  lng           double precision,
  status        public.bench_map_status,
  donor_name    text,     -- null unless adopted; "Anonymous" if donor opted out
  honoree       text,
  plaque_text   text,
  adopted_from  date,
  adopted_until date,     -- exclusive end; bench is free again on this date
  available_on  date,     -- date after the last booked term (null if not adoptable)
  photo_path    text,
  notes         text
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    -- The adoption that matters for each bench right now: the current or
    -- next upcoming approved/pending term.
    select distinct on (a.bench_id) a.*
    from public.adoptions a
    where a.status in ('pending', 'approved')
      and a.ends_on > public.park_today()
    order by a.bench_id, a.starts_on
  ),
  last_end as (
    select a.bench_id, max(a.ends_on) as ends_on
    from public.adoptions a
    where a.status in ('pending', 'approved')
      and a.ends_on > public.park_today()
    group by a.bench_id
  )
  select
    b.id,
    b.code,
    b.area,
    b.lat,
    b.lng,
    case
      when b.condition = 'unavailable' then 'unavailable'
      when b.condition = 'unsurveyed'  then 'unsurveyed'
      when l.status = 'approved'       then 'adopted'
      when l.status = 'pending'        then 'pending'
      else 'available'
    end::public.bench_map_status,
    case when l.status = 'approved'
         then case when l.show_donor then l.donor_name else 'Anonymous' end end,
    case when l.status = 'approved' then l.honoree end,
    case when l.status = 'approved' then l.plaque_text end,
    case when l.status = 'approved' then l.starts_on end,
    case when l.status = 'approved' then l.ends_on end,
    case when b.condition = 'active'
         then greatest(public.park_today(), coalesce(le.ends_on, public.park_today())) end,
    b.photo_path,
    b.notes
  from public.benches b
  left join live l      on l.bench_id = b.id
  left join last_end le on le.bench_id = b.id
  order by b.code;
$$;

-- ---------------------------------------------------------------------------
-- Public write API: request to adopt a bench (no login, no payment)
--   POST /rest/v1/rpc/request_adoption
-- Creates a 'pending' adoption that staff approve. Pending requests already
-- block the bench, so two donors can't claim the same term.
-- ---------------------------------------------------------------------------

create function public.request_adoption(
  p_bench_id      bigint,
  p_donor_name    text,
  p_contact_email text,
  p_term_months   int,
  p_starts_on     date    default null,  -- defaults to the first available date
  p_honoree       text    default null,
  p_plaque_text   text    default null,
  p_show_donor    boolean default true,
  p_contact_phone text    default null
)
returns table (adoption_id bigint, starts_on date, ends_on date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_condition public.bench_condition;
  v_start     date;
  v_end       date;
  v_id        bigint;
begin
  if p_term_months is null or p_term_months not between 1 and 120 then
    raise exception 'Adoption term must be between 1 and 120 months'
      using errcode = '22023';
  end if;

  if coalesce(trim(p_donor_name), '') = '' then
    raise exception 'Donor name is required' using errcode = '22023';
  end if;
  if coalesce(trim(p_contact_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid contact email is required' using errcode = '22023';
  end if;

  select condition into v_condition
  from public.benches where id = p_bench_id
  for update;  -- serialize concurrent requests for the same bench

  if not found then
    raise exception 'Bench % does not exist', p_bench_id using errcode = 'P0002';
  end if;
  if v_condition <> 'active' then
    raise exception 'Bench % is not open for adoption', p_bench_id using errcode = '22023';
  end if;

  -- Light abuse guard: cap open requests per email address.
  if (select count(*) from public.adoptions
      where lower(contact_email) = lower(trim(p_contact_email))
        and status = 'pending') >= 3 then
    raise exception 'Too many pending requests for this email address'
      using errcode = '22023';
  end if;

  v_start := coalesce(p_starts_on, (
    select greatest(public.park_today(), coalesce(max(a.ends_on), public.park_today()))
    from public.adoptions a
    where a.bench_id = p_bench_id and a.status in ('pending', 'approved')
  ));
  if v_start < public.park_today() then
    raise exception 'Start date cannot be in the past' using errcode = '22023';
  end if;
  v_end := (v_start + make_interval(months => p_term_months))::date;

  begin
    insert into public.adoptions (
      bench_id, donor_name, show_donor, honoree, plaque_text,
      contact_email, contact_phone, starts_on, ends_on
    ) values (
      p_bench_id, trim(p_donor_name), coalesce(p_show_donor, true),
      nullif(trim(p_honoree), ''), nullif(trim(p_plaque_text), ''),
      lower(trim(p_contact_email)), nullif(trim(p_contact_phone), ''),
      v_start, v_end
    )
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Bench % is already adopted or requested for part of that period',
      p_bench_id using errcode = '23P01';
  end;

  return query select v_id, v_start, v_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff API
--   POST /rest/v1/rpc/review_adoption  { p_adoption_id, p_approve, p_notes }
-- (Staff can also read/edit tables directly; RLS allows it.)
-- ---------------------------------------------------------------------------

create function public.review_adoption(
  p_adoption_id bigint,
  p_approve     boolean,
  p_notes       text default null
)
returns public.adoptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.adoptions;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  update public.adoptions
  set status      = case when p_approve then 'approved' else 'rejected' end::public.adoption_status,
      staff_notes = coalesce(p_notes, staff_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_adoption_id and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'Adoption % is not pending', p_adoption_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: expose only the intended surface to anonymous visitors.
-- ---------------------------------------------------------------------------

revoke all on function public.bench_map()        from public;
revoke all on function public.request_adoption(bigint, text, text, int, date, text, text, boolean, text) from public;
revoke all on function public.review_adoption(bigint, boolean, text) from public;
revoke all on function public.is_staff()         from public;

grant execute on function public.bench_map()        to anon, authenticated;
grant execute on function public.request_adoption(bigint, text, text, int, date, text, text, boolean, text) to anon, authenticated;
grant execute on function public.review_adoption(bigint, boolean, text) to authenticated;
grant execute on function public.is_staff()         to authenticated;

revoke all on public.adoptions from anon;
revoke all on public.staff     from anon;
revoke insert, update, delete on public.benches from anon;

-- ---------------------------------------------------------------------------
-- Photos: public-read bucket, staff-only uploads.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bench-photos', 'bench-photos', true)
on conflict (id) do nothing;

create policy bench_photos_staff_write on storage.objects
  for all to authenticated
  using (bucket_id = 'bench-photos' and public.is_staff())
  with check (bucket_id = 'bench-photos' and public.is_staff());
