# Web app

Next.js + MapLibre map of every bench, with a request-to-adopt form. Talks directly to the
Supabase API described in the [root README](../README.md).

```bash
cd web
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

- `src/app/bench/[code]/page.tsx`: shareable bench link (opens the map on that bench, with link-preview text)
- `src/app/staff/page.tsx` + `src/components/staff/`: staff dashboard (Overview, Requests, Adoptions, Benches)
- `src/components/BenchApp.tsx`: page layout, search, status/area filters
- `src/components/BenchMap.tsx`: MapLibre map, clustering, map/satellite styles
- `src/components/BenchPanel.tsx`: bench details
- `src/components/AdoptForm.tsx`: adoption request form
- `src/lib/benches.ts`: public Supabase calls and shared types
- `src/lib/staff.ts`: staff-only calls (protected by row-level security in the database)

`npm run dev` and `npm run build` first copy MapLibre's web worker into `public/maplibre/`
(`scripts/copy-maplibre-worker.mjs`). MapLibre v6 needs it served as a separate file.
