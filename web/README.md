# Web app

Next.js + MapLibre map of every bench, with a request-to-adopt form. Talks directly to the
Supabase API described in the [root README](../README.md).

```bash
cd web
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

- `src/components/BenchApp.tsx`: page layout, search, status/area filters
- `src/components/BenchMap.tsx`: MapLibre map, clustering, map/satellite styles
- `src/components/BenchPanel.tsx`: bench details
- `src/components/AdoptForm.tsx`: adoption request form
- `src/lib/benches.ts`: Supabase calls and shared types

`npm run dev` and `npm run build` first copy MapLibre's web worker into `public/maplibre/`
(`scripts/copy-maplibre-worker.mjs`). MapLibre v6 needs it served as a separate file.
