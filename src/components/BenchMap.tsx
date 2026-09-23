"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  GeolocateControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { STATUS_META, type Bench } from "@/lib/benches";

// Served from public/ by scripts/copy-maplibre-worker.mjs.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const PARK_CENTER: [number, number] = [-73.8872, 40.8975];
const PARK_BOUNDS: [[number, number], [number, number]] = [
  [-73.935, 40.86],
  [-73.835, 40.935],
];

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export type BaseStyle = "map" | "satellite";

type Padding = { top: number; bottom: number; left: number; right: number };
const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

// Space covered by BenchApp's floating overlays (marked with data-overlay),
// measured live so the bench being looked at lands in the part of the map
// that is actually visible, whatever the window size.
function overlayPadding(map: MapLibreMap, panelOpen: boolean): Padding {
  const box = map.getContainer().getBoundingClientRect();
  const { width: w, height: h } = box;
  const rect = (name: string) => document.querySelector(`[data-overlay="${name}"]`)?.getBoundingClientRect();
  const card = rect("controls");
  const panel = panelOpen ? rect("panel") : undefined;
  const gap = 12;
  const cardRight = card ? card.right - box.left + gap : 0;
  const cardBottom = card ? card.bottom - box.top + gap : 0;

  if (w >= 640) {
    const right = panel ? box.right - panel.left + gap : 0;
    // Room beside the card? Otherwise use the space below it.
    if (w - cardRight - right >= 240) return { top: 0, bottom: 0, left: cardRight, right };
    return { top: Math.min(cardBottom, h - 160), bottom: 0, left: 0, right };
  }
  // Phones: card on top, bench sheet at the bottom.
  const bottom = panel ? box.bottom - panel.top + gap : 0;
  return { top: Math.max(0, Math.min(cardBottom, h - bottom - 120)), bottom, left: 0, right: 0 };
}

// MapTiler when a key is configured; otherwise the keyless OpenFreeMap style
// so the app still works during setup.
function styleUrl(base: BaseStyle) {
  if (MAPTILER_KEY) {
    const id = base === "satellite" ? "hybrid" : "outdoor-v2";
    return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
  }
  return "https://tiles.openfreemap.org/styles/liberty";
}

export const SATELLITE_AVAILABLE = Boolean(MAPTILER_KEY);

// Adopted benches get their own unclustered source so they (and their donor
// name labels) stay visible at every zoom; everything else clusters.
type CircleLayer = Extract<Parameters<MapLibreMap["addLayer"]>[0], { type: "circle" }>;
type CirclePaint = CircleLayer["paint"];
type FilterSpecification = NonNullable<CircleLayer["filter"]>;

const SOURCE = "benches";
const PULSE_SOURCE = "bench-pulse";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const ADOPTED_SOURCE = "benches-adopted";
const POINT_LAYERS = ["benches", "benches-adopted"];
const SELECTED_LAYERS = ["bench-selected", "bench-selected-adopted"];

function splitBenches(benches: Bench[]) {
  return {
    clustered: toGeoJSON(benches.filter((b) => b.status !== "adopted")),
    adopted: toGeoJSON(benches.filter((b) => b.status === "adopted")),
  };
}

function toGeoJSON(benches: Bench[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: benches.map((b) => ({
      type: "Feature",
      id: b.id,
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      properties: {
        id: b.id,
        code: b.code,
        color: STATUS_META[b.status].color,
        // Only adopted benches carry a donor name (see bench_map()).
        ...(b.status === "adopted" && b.donor_name ? { donor: b.donor_name } : {}),
      },
    })),
  };
}

// Reuse a font the base style already ships, so our labels render on any
// style without guessing font names. Prefer an upright one (water and park
// labels are often italic).
function styleFont(style: StyleSpecification, weight: "Regular" | "Bold" = "Regular"): string[] {
  const fonts: string[][] = [];
  for (const layer of style.layers) {
    const font = layer.type === "symbol" ? layer.layout?.["text-font"] : undefined;
    if (Array.isArray(font) && font.every((f) => typeof f === "string")) fonts.push(font as string[]);
  }
  const upright = fonts.filter((f) => !f.some((name) => /italic/i.test(name)));
  return (
    upright.find((f) => f[0]?.includes(weight)) ??
    upright[0] ??
    fonts[0] ?? ["Noto Sans Regular"]
  );
}

export default function BenchMap({
  benches,
  selectedId,
  onSelect,
  base,
  fitKey = 0,
  pulse = null,
}: {
  benches: Bench[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  base: BaseStyle;
  /** Change to zoom the map to fit the current benches. */
  fitKey?: number;
  /** Play a ripple on this bench (n makes repeated pulses on one bench distinct). */
  pulse?: { id: number; n: number } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Latest props for handlers registered once.
  const latest = useRef({ benches, selectedId, onSelect });
  useLayoutEffect(() => {
    latest.current = { benches, selectedId, onSelect };
  });

  const flownTo = useRef<number | null>(null);
  function focusSelected() {
    const map = mapRef.current;
    if (!map || !map.getLayer("bench-selected")) return;
    const { selectedId, benches } = latest.current;
    for (const layer of SELECTED_LAYERS) map.setFilter(layer, ["==", ["get", "id"], selectedId ?? -1]);
    const bench = benches.find((b) => b.id === selectedId);
    if (bench && flownTo.current !== bench.id) {
      flownTo.current = bench.id;
      map.easeTo({
        center: [bench.lng, bench.lat],
        zoom: Math.max(map.getZoom(), 16.5),
        padding: overlayPadding(map, true),
      });
    }
    if (selectedId === null && flownTo.current !== null) {
      flownTo.current = null;
      map.easeTo({ padding: NO_PADDING, duration: 300 });
    }
  }

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: styleUrl(base),
      center: PARK_CENTER,
      zoom: 14.3,
      minZoom: 12.5,
      maxZoom: 19,
      maxBounds: PARK_BOUNDS,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "bottom-right",
    );

    // Custom sources/layers are dropped whenever the base style changes,
    // so (re)add them on every style load.
    map.on("style.load", () => {
      const font = styleFont(map.getStyle());
      const boldFont = styleFont(map.getStyle(), "Bold");
      const data = splitBenches(latest.current.benches);
      map.addSource(SOURCE, {
        type: "geojson",
        data: data.clustered,
        cluster: true,
        clusterRadius: 36,
        clusterMaxZoom: 15,
      });
      map.addSource(ADOPTED_SOURCE, { type: "geojson", data: data.adopted });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1f4d2b",
          "circle-opacity": 0.88,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": font,
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      const pointPaint: CirclePaint = {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 6, 18, 10],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      };
      const selectedPaint: CirclePaint = {
        "circle-radius": 14,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#111111",
        "circle-stroke-width": 3,
      };
      const selectedFilter: FilterSpecification = ["==", ["get", "id"], latest.current.selectedId ?? -1];

      map.addSource(PULSE_SOURCE, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "bench-pulse",
        type: "circle",
        source: PULSE_SOURCE,
        paint: { "circle-color": ["get", "color"], "circle-radius": 8, "circle-opacity": 0 },
      });
      map.addLayer({ id: "bench-selected", type: "circle", source: SOURCE, filter: selectedFilter, paint: selectedPaint });
      map.addLayer({
        id: "benches",
        type: "circle",
        source: SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: pointPaint,
      });
      map.addLayer({
        id: "bench-selected-adopted",
        type: "circle",
        source: ADOPTED_SOURCE,
        filter: selectedFilter,
        paint: selectedPaint,
      });
      map.addLayer({ id: "benches-adopted", type: "circle", source: ADOPTED_SOURCE, paint: pointPaint });
      map.addLayer({
        id: "bench-donor-labels",
        type: "symbol",
        source: ADOPTED_SOURCE,
        filter: ["has", "donor"],
        layout: {
          "text-field": ["get", "donor"],
          "text-font": boldFont,
          "text-size": 12,
          // Try below the pin first, then other sides, so nearby names don't hide each other.
          "text-variable-anchor": ["top", "bottom", "right", "left"],
          "text-radial-offset": 0.9,
          "text-justify": "auto",
          "text-max-width": 10,
        },
        paint: {
          "text-color": STATUS_META.adopted.color,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
      focusSelected();
    });

    map.on("click", POINT_LAYERS, (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === "number") latest.current.onSelect(id);
    });
    map.on("click", "clusters", async (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const source = map.getSource(SOURCE) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({
        center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
      });
    });
    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [...POINT_LAYERS, "clusters"] });
      if (hits.length === 0) latest.current.onSelect(null);
    });
    for (const layer of [...POINT_LAYERS, "clusters"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is created once
  }, []);

  // Switch base style (map/satellite).
  const firstBase = useRef(base);
  useEffect(() => {
    if (base === firstBase.current) return;
    firstBase.current = base;
    mapRef.current?.setStyle(styleUrl(base));
  }, [base]);

  // Push filtered benches into the source.
  useEffect(() => {
    const map = mapRef.current;
    const data = splitBenches(benches);
    (map?.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data.clustered);
    (map?.getSource(ADOPTED_SOURCE) as GeoJSONSource | undefined)?.setData(data.adopted);
  }, [benches]);

  // Ripple out from a bench, e.g. right after it was requested, so the status
  // change is noticeable. Three ~0.9s rings in the bench's (new) color.
  useEffect(() => {
    const map = mapRef.current;
    const bench = pulse && latest.current.benches.find((b) => b.id === pulse.id);
    const source = map?.getSource(PULSE_SOURCE) as GeoJSONSource | undefined;
    if (!map || !bench || !source) return;

    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [bench.lng, bench.lat] },
          properties: { color: STATUS_META[bench.status].color },
        },
      ],
    });
    const PERIOD = 900;
    const RINGS = 3;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= PERIOD * RINGS || !map.getLayer("bench-pulse")) {
        source.setData(EMPTY);
        return;
      }
      const phase = (elapsed % PERIOD) / PERIOD;
      map.setPaintProperty("bench-pulse", "circle-radius", 8 + phase * 30);
      map.setPaintProperty("bench-pulse", "circle-opacity", (1 - phase) * 0.55);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.setData(EMPTY);
    };
  }, [pulse]);

  // Zoom to fit the given benches whenever fitKey changes (e.g. "Find a bench").
  useEffect(() => {
    const map = mapRef.current;
    const { benches } = latest.current;
    if (!fitKey || !map || benches.length === 0) return;
    const lngs = benches.map((b) => b.lng);
    const lats = benches.map((b) => b.lat);
    const edge = overlayPadding(map, false);
    map.setPadding(NO_PADDING);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: { top: edge.top + 40, bottom: edge.bottom + 40, left: edge.left + 40, right: edge.right + 40 },
        maxZoom: 16.5,
      },
    );
  }, [fitKey]);

  // Highlight and fly to the selected bench. A bench opened from a /bench/<code>
  // link may be selected before the data or the map style has loaded, so this
  // also runs when either arrives (see flownTo / "style.load").
  useEffect(() => {
    focusSelected();
  }, [selectedId, benches]);

  // MapLibre's CSS sets position: relative on the map element, so size it via a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
