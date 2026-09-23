-- Grant staff access by email domain (e.g. everyone @columbia.edu), in
-- addition to individual accounts listed in public.staff.
--
-- Access requires a *confirmed* email address, so nobody can sign up as
-- someone@columbia.edu without receiving the confirmation email there.

create table public.staff_domains (
  domain     text primary key check (domain = lower(domain) and domain !~ '@'),
  created_at timestamptz not null default now()
);

alter table public.staff_domains enable row level security;
revoke all on public.staff_domains from anon, authenticated;

insert into public.staff_domains (domain) values ('columbia.edu');

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
      or exists (
        select 1
        from auth.users u
        join public.staff_domains d
          on d.domain = lower(split_part(u.email, '@', 2))
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
      );
$$;
