-- PLACEHOLDER DATA for local development only.
-- Bench positions are approximate points scattered around rough area centers,
-- not surveyed locations. Replace with the park's real inventory before launch
-- (see data/benches_template.csv).

insert into public.benches (code, area, lat, lng, notes)
select
  format('VCP-%s', lpad((row_number() over ())::text, 4, '0')),
  a.area,
  a.lat + (random() - 0.5) * 0.002,
  a.lng + (random() - 0.5) * 0.002,
  'Placeholder location'
from (values
  ('Parade Ground',               40.8890, -73.8960),
  ('Van Cortlandt Lake',          40.8960, -73.8905),
  ('Van Cortlandt House Museum',  40.8912, -73.8950),
  ('Tibbetts Brook',              40.9010, -73.8920),
  ('Northwest Forest',            40.9030, -73.8980),
  ('Northeast Forest',            40.9000, -73.8780),
  ('Putnam Trail',                40.8970, -73.8880)
) as a(area, lat, lng)
cross join generate_series(1, 6);

-- A few benches in each state so every map status shows up.
update public.benches set condition = 'unavailable', notes = 'Placeholder: under repair'
where code in ('VCP-0005', 'VCP-0017');
update public.benches set condition = 'unsurveyed'
where code in ('VCP-0011', 'VCP-0029');

insert into public.adoptions
  (bench_id, status, donor_name, show_donor, honoree, plaque_text,
   contact_email, starts_on, ends_on)
select b.id, x.status::public.adoption_status, x.donor, x.show_donor, x.honoree, x.plaque,
       x.email, current_date + x.start_offset, current_date + x.end_offset
from (values
  ('VCP-0001', 'approved', 'The Rivera Family', true,  'Rosa Rivera',  'In loving memory of Rosa Rivera', 'rivera@example.com', -200, 530),
  ('VCP-0002', 'approved', 'Jordan Lee',        false, null,           'Enjoy the view',                   'jlee@example.com',    -30, 335),
  ('VCP-0008', 'approved', 'Bronx Runners Club', true, null,           'Keep running, Bronx!',             'club@example.com',   -700,  30),
  ('VCP-0014', 'pending',  'Sam Okafor',        true,  'Grace Okafor', 'For Grace, who loved this lake',   'sam@example.com',       0, 365),
  ('VCP-0020', 'approved', 'Anna Kowalski',     true,  null,           null,                               'anna@example.com',     60, 790)
) as x(code, status, donor, show_donor, honoree, plaque, email, start_offset, end_offset)
join public.benches b on b.code = x.code;
