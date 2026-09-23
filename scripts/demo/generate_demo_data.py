#!/usr/bin/env python3
"""Generate supabase/demo/demo_data.sql: ~520 demo benches with realistic adoptions.

Bench locations come from OpenStreetMap (© OpenStreetMap contributors, ODbL):
every bench already mapped in Van Cortlandt Park, plus benches placed along the
park's real footpaths (outside the golf course) to reach the target count.
Each bench is named after the nearest real landmark. Donors, honorees and
messages are fictional.

    python3 scripts/demo/generate_demo_data.py            # fetch OSM + write SQL
    python3 scripts/demo/generate_demo_data.py --cache DIR  # reuse/save OSM JSON in DIR

Deterministic for a given OSM snapshot (fixed random seed). Standard library only.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "supabase" / "demo" / "demo_data.sql"

PARK_WAY_ID = 56384794  # "Van Cortlandt Park" (leisure=park) in OSM
TARGET_BENCHES = 520
MIN_GAP_M = 22  # no two benches closer than this
OVERPASS = "https://overpass-api.de/api/interpreter"

# Areas: nearest landmark wins. Coordinates are the OSM features' centers.
AREAS = [
    ("Van Cortlandt Lake", [(40.89109, -73.89106), (40.8911, -73.89393), (40.89089, -73.89141)]),
    ("Stadium & Parade Ground", [(40.88815, -73.8976), (40.89009, -73.89627), (40.88683, -73.89899)]),
    ("Vault Hill", [(40.89778, -73.89222), (40.89602, -73.89232)]),
    ("Golf Course Edge", [(40.89819, -73.88755)]),
    ("Indian Field", [(40.89645, -73.87797)]),
    ("Northeast Fields", [(40.90005, -73.87236), (40.90103, -73.87065), (40.90318, -73.87294), (40.89952, -73.87342)]),
    ("Northwest Woods", [(40.90133, -73.89508), (40.90346, -73.89562), (40.899, -73.89515)]),
    ("Croton Aqueduct", [(40.90108, -73.88286)]),
    ("Sachkerah Woods", [(40.88393, -73.88157)]),
]
# How popular each area is for adoption (busy, scenic spots adopt faster).
POPULARITY = {
    "Van Cortlandt Lake": 0.55,
    "Stadium & Parade Ground": 0.45,
    "Vault Hill": 0.30,
    "Golf Course Edge": 0.25,
    "Indian Field": 0.30,
    "Northeast Fields": 0.35,
    "Northwest Woods": 0.18,
    "Croton Aqueduct": 0.20,
    "Sachkerah Woods": 0.15,
}

FIRST = """Maria James Aisha Daniel Rosa Kevin Grace Luis Hannah Omar Mei Carlos Priya Sean
Fatima David Elena Marcus Sofia Tom Nia Victor Ruth Andre Leah Samuel Ana Joseph Irene Malik
Chloe Ramon Esther Kofi Lucia Patrick Yuki Darnell Olga Hector""".split()
LAST = """Rivera Chen Okafor Kowalski Morales Goldberg Nguyen O'Brien Patel Santos Williams Haddad
Kim Reyes Johnson Lopez Murphy Cohen Diaz Ahmed Rossi Brown Martinez Singh Park Torres Green
Fitzgerald Mendez Novak Jackson Castillo Weiss Mensah Ortiz Lee Russo Baptiste Flores Kaplan""".split()
GROUPS = [
    "Kingsbridge Morning Walkers", "Riverdale Book Circle", "Northwest Bronx Birders", "Class of 1998",
    "Broadway Bagel Co.", "Jerome Avenue Runners", "Woodlawn Garden Club", "PS 81 Parents Association",
    "Bronx Science Alumni", "Tuesday Tai Chi Group", "Mosholu Chess Club", "The Lakeside Knitters",
]
PLAQUES = [
    "In loving memory of {h}",
    "For {h}, who loved this park",
    "{h} — forever on these trails",
    "In honor of {h}",
    "Sit a while with {h}",
    "Remembering {h}, 1941–2025",
    "Happy 80th birthday, {h}!",
    "For {h}, our favorite runner",
]
PLAQUES_NO_HONOREE = [
    "Enjoy the view",
    "Rest here, neighbor",
    "Take a breath. You're in the Bronx's backyard.",
    "Sit, stay, enjoy",
    "For everyone who walks this way",
]
STAFF_NOTES = ["Plaque ordered", "Plaque installed", "Donation received", "Renewal reminder sent", None, None, None]

MESSAGES = [
    ("plaque", "The plaque was installed this morning — it looks beautiful. Thank you all so much!", "resolved", 20),
    ("damage", "Two slats on the backrest are cracked and one bolt is missing.", "in_progress", 6),
    ("question", "When will the plaque for our bench go up? We submitted the text in the spring.", "new", 2),
    ("bench_photo", "Visited our bench on Grandpa's birthday. Sharing how it looks in the fall.", "new", 1),
    ("damage", "Graffiti on the seat and the plaque is scratched.", "new", 0),
    ("plaque", "Could we fix a typo on our plaque? The honoree's last name is misspelled.", "in_progress", 9),
    ("question", "Is it possible to renew for another 5 years before the current term ends?", "resolved", 30),
]


# ---------------------------------------------------------------------------
# OpenStreetMap
# ---------------------------------------------------------------------------

QUERY = f"""[out:json][timeout:120];
way({PARK_WAY_ID});map_to_area->.a;
way({PARK_WAY_ID});out geom;
way["highway"~"^(footway|path|pedestrian)$"](area.a);out geom;
way["leisure"="golf_course"](area.a);out geom;
node["amenity"="bench"](area.a);out body;"""


def fetch_osm(cache: Path | None) -> dict:
    cached = cache / "van_cortlandt_osm.json" if cache else None
    if cached and cached.exists():
        return json.loads(cached.read_text())
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    req = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": "bench-adoption-demo/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())
    if cached:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data))
    return data


# ---------------------------------------------------------------------------
# Geometry (small area: equirectangular metres are accurate enough)
# ---------------------------------------------------------------------------

M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LNG = 111_320.0 * math.cos(math.radians(40.895))


def dist_m(a, b):
    return math.hypot((a[0] - b[0]) * M_PER_DEG_LAT, (a[1] - b[1]) * M_PER_DEG_LNG)


def inside(pt, poly):
    """Ray casting; poly is a list of (lat, lng)."""
    lat, lng = pt
    hit = False
    for (a_lat, a_lng), (b_lat, b_lng) in zip(poly, poly[1:] + poly[:1]):
        if (a_lng > lng) != (b_lng > lng):
            cross = a_lat + (lng - a_lng) * (b_lat - a_lat) / (b_lng - a_lng)
            if lat < cross:
                hit = not hit
    return hit


def along(line, spacing):
    """Points every `spacing` metres along a polyline, starting half a step in."""
    out, carry = [], spacing / 2
    for a, b in zip(line, line[1:]):
        seg = dist_m(a, b)
        pos = carry
        while pos < seg:
            t = pos / seg
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            pos += spacing
        carry = pos - seg
    return out


def nearest_area(pt):
    best = min(((dist_m(pt, c), name) for name, cs in AREAS for c in cs))
    return best[1]


def place_benches(osm: dict):
    ways = [e for e in osm["elements"] if e["type"] == "way" and "geometry" in e]
    geom = lambda w: [(p["lat"], p["lon"]) for p in w["geometry"]]
    park = next(geom(w) for w in ways if w["id"] == PARK_WAY_ID)
    golf = [geom(w) for w in ways if w.get("tags", {}).get("leisure") == "golf_course"]
    paths = [w for w in ways if w.get("tags", {}).get("highway")]

    def ok(pt, placed):
        return (
            inside(pt, park)
            and not any(inside(pt, g) for g in golf)
            and all(dist_m(pt, q) >= MIN_GAP_M for q, *_ in placed)
        )

    # 1) Benches already mapped in OSM.
    placed = []
    for n in (e for e in osm["elements"] if e["type"] == "node"):
        pt = (n["lat"], n["lon"])
        if inside(pt, park) and all(dist_m(pt, q) >= 3 for q, *_ in placed):
            placed.append((pt, "osm", None))
    mapped = len(placed)

    # 2) Fill along footpaths; tighten spacing until the target is reached.
    candidates = []
    spacing = 120.0
    while True:
        trial = list(placed)
        for w in paths:
            trail = w["tags"].get("name")
            for pt in along(geom(w), spacing):
                if ok(pt, trial):
                    trial.append((pt, "path", trail))
        if len(trial) >= TARGET_BENCHES or spacing < 25:
            candidates = trial
            break
        spacing *= 0.9
    rng = random.Random(7)
    extra = candidates[mapped:]
    rng.shuffle(extra)
    chosen = candidates[:mapped] + extra[: TARGET_BENCHES - mapped]
    return chosen, mapped, spacing


# ---------------------------------------------------------------------------
# Adoption data
# ---------------------------------------------------------------------------


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def person(rng):
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"


def donor(rng):
    r = rng.random()
    if r < 0.45:
        return f"The {rng.choice(LAST)} Family"
    if r < 0.85:
        return person(rng)
    return rng.choice(GROUPS)


def email_for(name, i):
    slug = "".join(ch for ch in name.lower() if ch.isalnum())[:18] or "donor"
    return f"{slug}{i}@example.com"


def build(chosen):
    rng = random.Random(2026)
    benches, adoptions = [], []

    # Stable codes: sort by area, then north→south, west→east.
    rows = [(nearest_area(pt), pt, src, trail) for pt, src, trail in chosen]
    rows.sort(key=lambda r: (r[0], -round(r[1][0], 4), r[1][1]))

    for i, (area, (lat, lng), src, trail) in enumerate(rows, start=1):
        code = f"VCP-{i:04d}"
        r = rng.random()
        condition = "active"
        notes = f"Along the {trail}" if trail and not trail.startswith("A ") else None
        if r < 0.025:
            condition, notes = "unavailable", rng.choice(["Under repair", "Removed for path work", "Awaiting replacement"])
        elif r < 0.045 and src == "path":
            condition = "unsurveyed"
        benches.append((code, area, round(lat, 6), round(lng, 6), condition, notes))
        if condition != "active":
            continue

        pop = POPULARITY[area]
        bench_adoptions = []
        roll = rng.random()
        if roll < pop:  # currently adopted
            term = rng.choice([365, 730, 730, 1095, 1825])
            start = -rng.randint(10, term - 5)
            end = start + term
            if rng.random() < 0.08:  # ending within 90 days → renewals list
                end = rng.randint(5, 88)
                start = end - rng.choice([365, 730])
            a = adoption(rng, code, "approved", start, end)
            bench_adoptions.append(a)
            nxt = rng.random()
            if end <= 90 and nxt < 0.4:  # some already renewed
                bench_adoptions.append(adoption(rng, code, "approved", end, end + 730, donor_name=a["donor"], email=a["email"]))
            elif nxt < 0.03:
                bench_adoptions.append(adoption(rng, code, "pending", end, end + 365))
        elif roll < pop + 0.03:  # waiting for staff review
            bench_adoptions.append(adoption(rng, code, "pending", rng.choice([0, 7, 14]), None, created=-rng.randint(0, 6)))
        elif roll < pop + 0.045:  # approved, starts soon
            start = rng.randint(10, 60)
            bench_adoptions.append(adoption(rng, code, "approved", start, start + 730))
        elif roll < pop + 0.06:  # a request that was turned down
            bench_adoptions.append(adoption(rng, code, "rejected", 0, 365, created=-rng.randint(10, 90)))

        # A finished earlier adoption gives some benches a history. It must end
        # before any live term starts (the database rejects overlaps).
        if rng.random() < pop * 0.35:
            first = min([a["start"] for a in bench_adoptions if a["status"] != "rejected"] + [0])
            end = first - rng.randint(1, 120)
            start = end - rng.choice([365, 730, 1095])
            bench_adoptions.insert(0, adoption(rng, code, "approved", start, end))
        adoptions.extend(bench_adoptions)
    return benches, adoptions


_n = 0


def adoption(rng, code, status, start, end, donor_name=None, email=None, created=None):
    global _n
    _n += 1
    name = donor_name or donor(rng)
    honoree = person(rng) if rng.random() < 0.55 else None
    plaque = (
        rng.choice(PLAQUES).format(h=honoree)
        if honoree
        else (rng.choice(PLAQUES_NO_HONOREE) if rng.random() < 0.6 else None)
    )
    if end is None:
        end = start + rng.choice([365, 730, 1095])
    return {
        "code": code,
        "status": status,
        "donor": name,
        "show": rng.random() > 0.12,
        "honoree": honoree,
        "plaque": plaque,
        "email": email or email_for(name, _n),
        "phone": f"718-555-{rng.randint(1000, 9999)}" if rng.random() < 0.4 else None,
        "notes": rng.choice(STAFF_NOTES) if status == "approved" else None,
        "start": start,
        "end": end,
        "created": created if created is not None else min(start, 0) - rng.randint(3, 30),
    }


# ---------------------------------------------------------------------------
# SQL output
# ---------------------------------------------------------------------------


def write_sql(benches, adoptions, mapped, spacing):
    status_counts = {}
    for a in adoptions:
        status_counts[a["status"]] = status_counts.get(a["status"], 0) + 1
    lines = [
        "-- DEMO DATA — replaces ALL benches, adoptions and messages. Safe to re-run to reset a demo.",
        "--",
        f"-- {len(benches)} benches in Van Cortlandt Park: {mapped} mapped in OpenStreetMap, the rest placed",
        f"-- along real footpaths (~{spacing:.0f} m apart, outside the golf course), named after the nearest landmark.",
        "-- Bench locations derived from © OpenStreetMap contributors (ODbL). Donors, honorees and messages are fictional.",
        "-- Dates are relative to the day you run this, so the demo always looks current.",
        "--",
        "-- Generated by scripts/demo/generate_demo_data.py — edit that, not this file.",
        "-- Staff accounts (public.staff, staff_domains) and uploaded photo files are left untouched.",
        "",
        "begin;",
        "",
        "truncate public.bench_submissions, public.adoptions, public.benches restart identity cascade;",
        "",
        "insert into public.benches (code, area, lat, lng, condition, notes) values",
    ]
    lines.append(
        ",\n".join(f"  ({sql(c)}, {sql(a)}, {lat}, {lng}, {sql(cond)}, {sql(n)})" for c, a, lat, lng, cond, n in benches)
        + ";"
    )
    lines += [
        "",
        f"-- {len(adoptions)} adoptions: " + ", ".join(f"{v} {k}" for k, v in sorted(status_counts.items())),
        "insert into public.adoptions",
        "  (bench_id, status, donor_name, show_donor, honoree, plaque_text, contact_email, contact_phone,",
        "   staff_notes, starts_on, ends_on, reviewed_at, created_at)",
        "select b.id, x.status::public.adoption_status, x.donor, x.show, x.honoree, x.plaque, x.email, x.phone,",
        "       x.notes, current_date + x.s, current_date + x.e,",
        "       case when x.status in ('approved', 'rejected') then now() + make_interval(days => x.c + 2) end,",
        "       now() + make_interval(days => x.c)",
        "from (values",
    ]
    lines.append(
        ",\n".join(
            f"  ({sql(a['code'])}, {sql(a['status'])}, {sql(a['donor'])}, {sql(a['show'])}, {sql(a['honoree'])}, "
            f"{sql(a['plaque'])}, {sql(a['email'])}, {sql(a['phone'])}, {sql(a['notes'])}, {a['start']}, {a['end']}, {a['created']})"
            for a in adoptions
        )
    )
    lines += [
        ") as x(code, status, donor, show, honoree, plaque, email, phone, notes, s, e, c)",
        "join public.benches b on b.code = x.code;",
        "",
        "-- Messages for the staff inbox (text only; add photos live during a demo).",
        "insert into public.bench_submissions (bench_id, topic, message, contact_name, contact_email, status, staff_notes, created_at)",
        "select b.id, x.topic::public.submission_topic, x.message, a.donor_name, a.contact_email,",
        "       x.status::public.submission_status, x.staff_notes, now() - make_interval(days => x.days_ago, hours => x.n)",
        "from (values",
    ]
    rng = random.Random(99)
    adopted_codes = sorted({a["code"] for a in adoptions if a["status"] == "approved" and a["start"] <= 0 < a["end"]})
    picks = rng.sample(adopted_codes, len(MESSAGES))
    lines.append(
        ",\n".join(
            f"  ({sql(code)}, {sql(topic)}, {sql(msg)}, {sql(status)}, "
            f"{sql('Sent to maintenance' if status == 'in_progress' and topic == 'damage' else None)}, {days}, {n})"
            for n, (code, (topic, msg, status, days)) in enumerate(zip(picks, MESSAGES), start=1)
        )
    )
    lines += [
        ") as x(code, topic, message, status, staff_notes, days_ago, n)",
        "join public.benches b on b.code = x.code",
        "join lateral (",
        "  select donor_name, contact_email from public.adoptions",
        "  where bench_id = b.id and status = 'approved' and starts_on <= current_date and ends_on > current_date",
        "  limit 1",
        ") a on true;",
        "",
        "commit;",
        "",
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, help="directory to reuse/save the OpenStreetMap download")
    args = ap.parse_args()

    osm = fetch_osm(args.cache)
    chosen, mapped, spacing = place_benches(osm)
    benches, adoptions = build(chosen)
    write_sql(benches, adoptions, mapped, spacing)

    by_area = {}
    for _, area, *_ in benches:
        by_area[area] = by_area.get(area, 0) + 1
    print(f"wrote {OUT.relative_to(ROOT)}: {len(benches)} benches ({mapped} from OSM), {len(adoptions)} adoptions")
    for area, n in sorted(by_area.items()):
        print(f"  {area:26} {n}")


if __name__ == "__main__":
    main()
