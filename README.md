# Bench Adoption Solution

A single source of truth for Van Cortlandt Park's bench adoption program (500+ benches):

- **View** every bench on a map: available, adopted (by whom, until when), pending, or unavailable.
- **Adopt** a bench by submitting a request, which park staff approve. There is no payment step.

## Stack

| Layer | Choice |
|---|---|
| Database + API | [Supabase](https://supabase.com) (Postgres, auto-generated REST API, Auth, Storage) |
| Map (frontend, next) | Google Maps JavaScript API |

## Backend layout

```
supabase/
  migrations/20260922000000_init.sql   schema, rules, security, API functions
  seed.sql                             PLACEHOLDER benches + sample adoptions (dev only)
data/
  benches_template.csv                 column format for importing the real inventory
```

### Data model

- **`benches`**: one row per physical bench. Stores `code` (plaque/inventory number), `area`, `lat`/`lng`, `condition` (`active` | `unavailable` | `unsurveyed`), `photo_path` and `notes`.
- **`adoptions`**: one row per adoption term. Stores the donor name, honoree, plaque text, the `starts_on`/`ends_on` term, and a `status` (`pending` | `approved` | `rejected` | `cancelled`). Contact details are stored here too and are visible to staff only.
- **`staff`**: Supabase Auth users who can approve requests and edit benches.

The database enforces these rules itself, so they hold no matter which client writes the data:

- **No double adoption.** Two pending or approved adoptions of the same bench can't have overlapping dates. A Postgres exclusion constraint enforces this.
- **Status is derived, never stored.** A bench's map status is computed from its adoptions every time it's read, so it can't go stale. When a term ends, the bench shows as available again automatically, with no cron job needed.
- **Contact details stay private.** Anonymous visitors can't read the `adoptions` table. Donors who choose `show_donor = false` appear as "Anonymous".

## API (for the frontend)

Every call goes to `https://<project>.supabase.co/rest/v1/` with the project's **anon** key. With `@supabase/supabase-js`:

### Get all benches for the map: `bench_map()`

```js
const { data } = await supabase.rpc('bench_map')
// optional filters: .eq('status', 'available').eq('area', 'Parade Ground')
```

Each row contains:

| field | notes |
|---|---|
| `id`, `code`, `area`, `lat`, `lng` | |
| `status` | `available` \| `adopted` \| `pending` \| `unavailable` \| `unsurveyed` (drives the marker color) |
| `donor_name` | only when adopted; `"Anonymous"` if the donor opted out |
| `honoree`, `plaque_text` | only when adopted |
| `adopted_from`, `adopted_until` | term dates; `adopted_until` is exclusive (the date the bench frees up) |
| `available_on` | earliest date a new adoption can start after all booked terms; null if the bench isn't adoptable |
| `photo_path`, `notes` | photo is in the public `bench-photos` storage bucket |

About 500 rows come back in one request, which is small enough to load in full.

### Request an adoption: `request_adoption(...)`

```js
const { data, error } = await supabase.rpc('request_adoption', {
  p_bench_id: 42,
  p_donor_name: 'The Rivera Family',
  p_contact_email: 'rivera@example.com',
  p_term_months: 24,              // 1–120
  p_starts_on: null,              // optional; defaults to the bench's next free date
  p_honoree: 'Rosa Rivera',       // optional
  p_plaque_text: 'In loving memory',  // optional, ≤200 chars
  p_show_donor: true,             // optional
  p_contact_phone: null           // optional
})
// data → [{ adoption_id, starts_on, ends_on }]
```

This creates a **pending** request, and the bench shows as `pending` on the map straight away. `error.message` is readable enough to show users directly. It covers these cases:

- the bench is already taken for those dates
- the bench isn't open for adoption
- invalid email or blank name
- start date in the past
- more than 3 pending requests from the same email

### Staff: approve or reject — `review_adoption(...)`

```js
await supabase.rpc('review_adoption', { p_adoption_id: 7, p_approve: true, p_notes: 'Plaque ordered' })
```

Staff sign in with Supabase Auth and can also read and edit the `benches` and `adoptions` tables directly. Row-level security allows this for staff only.

## Setup

1. Create a Supabase project at https://supabase.com/dashboard.
2. Apply the schema, either:
   - **Dashboard:** open the SQL Editor, then paste and run `supabase/migrations/20260922000000_init.sql`, or
   - **CLI:** `supabase init` (keeps the existing `migrations/`), then `supabase link --project-ref <ref>`, then `supabase db push`.
3. Load benches:
   - **Dev:** run `supabase/seed.sql` for 42 placeholder benches with sample adoptions.
   - **Real data:** import a CSV in the format of `data/benches_template.csv` into `benches` (Table Editor → Import).
4. Make a staff account: create the user under **Authentication → Users**, then run:
   ```sql
   insert into public.staff (user_id) values ('<user uuid>');
   ```

## Notes for the Google Maps frontend

- Use the **Maps JavaScript API** with **Advanced Markers**, which needs a **Map ID** created in Google Cloud Console. Use **`@googlemaps/markerclusterer`** so 500 pins stay readable when zoomed out.
- Restrict the API key to your site's domains (HTTP referrer restriction) and to the Maps JavaScript API only. The key is visible in the browser.
- Coordinates are plain `lat`/`lng` doubles, which pass straight into `{ lat, lng }` markers. The database rejects points outside a box around Van Cortlandt Park.
- Suggested legend: available = green, adopted = red, pending = orange, unavailable = yellow, unsurveyed = gray.

## Known gaps / next steps

- **Real bench inventory.** The seed locations are placeholders. Real coordinates are needed, either from the park or collected by walking the park with a phone.
- **Future terms.** A bench with an approved term that hasn't started yet shows as `adopted` (with `adopted_from` in the future), so the frontend should say "Adopted from …".
- Confirmation emails to donors (e.g. Supabase Edge Function + Resend).
- Spam protection on `request_adoption` beyond the per-email cap (e.g. a CAPTCHA). Staff approval is the main safeguard.
