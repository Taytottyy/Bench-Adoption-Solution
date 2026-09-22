import { supabase } from "./supabase";

export type BenchStatus = "available" | "adopted" | "pending" | "unavailable" | "unsurveyed";

// One row of public.bench_map() — see supabase/migrations/*_init.sql.
export type Bench = {
  id: number;
  code: string;
  area: string | null;
  lat: number;
  lng: number;
  status: BenchStatus;
  donor_name: string | null;
  honoree: string | null;
  plaque_text: string | null;
  adopted_from: string | null;
  adopted_until: string | null; // exclusive: the bench is free again on this date
  available_on: string | null;
  photo_path: string | null;
  notes: string | null;
};

export const STATUS_META: Record<BenchStatus, { label: string; color: string }> = {
  available: { label: "Available", color: "#2e8540" },
  adopted: { label: "Adopted", color: "#c8372d" },
  pending: { label: "Pending approval", color: "#e07b12" },
  unavailable: { label: "Not available", color: "#d4a514" },
  unsurveyed: { label: "Not surveyed", color: "#7a7a7a" },
};

export const STATUS_ORDER: BenchStatus[] = [
  "available",
  "adopted",
  "pending",
  "unavailable",
  "unsurveyed",
];

export async function fetchBenches(): Promise<Bench[]> {
  const { data, error } = await supabase.rpc("bench_map");
  if (error) throw new Error(error.message);
  return data as Bench[];
}

export type AdoptionRequest = {
  benchId: number;
  donorName: string;
  email: string;
  phone?: string;
  termMonths: number;
  startsOn?: string; // YYYY-MM-DD; omitted => next free date
  honoree?: string;
  plaqueText?: string;
  showDonor: boolean;
};

export async function requestAdoption(req: AdoptionRequest) {
  const { data, error } = await supabase.rpc("request_adoption", {
    p_bench_id: req.benchId,
    p_donor_name: req.donorName,
    p_contact_email: req.email,
    p_term_months: req.termMonths,
    p_starts_on: req.startsOn || null,
    p_honoree: req.honoree || null,
    p_plaque_text: req.plaqueText || null,
    p_show_donor: req.showDonor,
    p_contact_phone: req.phone || null,
  });
  if (error) throw new Error(error.message);
  const row = (data as { adoption_id: number; starts_on: string; ends_on: string }[])[0];
  return row;
}

export function photoUrl(path: string) {
  return supabase.storage.from("bench-photos").getPublicUrl(path).data.publicUrl;
}

// Dates from Postgres are plain YYYY-MM-DD; format without timezone shifts.
export function formatDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// adopted_until is exclusive; show the last day of the term to people.
export function lastDay(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
