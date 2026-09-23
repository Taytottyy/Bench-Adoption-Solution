// Staff-only data access. Every call here is enforced by row-level security
// in the database (public.is_staff()); the UI checks are just for display.
import { supabase } from "./supabase";

export type AdoptionStatus = "pending" | "approved" | "rejected" | "cancelled";

export type Adoption = {
  id: number;
  bench_id: number;
  status: AdoptionStatus;
  donor_name: string;
  show_donor: boolean;
  honoree: string | null;
  plaque_text: string | null;
  contact_email: string;
  contact_phone: string | null;
  staff_notes: string | null;
  starts_on: string;
  ends_on: string;
  reviewed_at: string | null;
  created_at: string;
  benches: { code: string; area: string | null } | null;
};

export type BenchCondition = "active" | "unavailable" | "unsurveyed";

export type BenchRecord = {
  id: number;
  code: string;
  area: string | null;
  lat: number;
  lng: number;
  condition: BenchCondition;
  photo_path: string | null;
  notes: string | null;
};

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

// Staff = listed in public.staff, or a confirmed email on a domain in
// public.staff_domains (see migrations). Decided by the database.
export async function isStaff() {
  return Boolean(check(await supabase.rpc("is_staff")));
}

// Shown on the sign-in page only; access itself is decided by the database.
export const STAFF_EMAIL_DOMAIN = "columbia.edu";

export async function fetchAdoptions(): Promise<Adoption[]> {
  return check(
    await supabase
      .from("adoptions")
      .select("*, benches(code, area)")
      .order("created_at", { ascending: false }),
  ) as Adoption[];
}

export async function fetchBenchRecords(): Promise<BenchRecord[]> {
  return check(
    await supabase
      .from("benches")
      .select("id, code, area, lat, lng, condition, photo_path, notes")
      .order("code"),
  ) as BenchRecord[];
}

export async function reviewAdoption(id: number, approve: boolean, notes?: string) {
  check(
    await supabase.rpc("review_adoption", {
      p_adoption_id: id,
      p_approve: approve,
      p_notes: notes || null,
    }),
  );
}

export async function updateAdoption(id: number, patch: Partial<Pick<Adoption, "status" | "ends_on" | "staff_notes">>) {
  check(await supabase.from("adoptions").update(patch).eq("id", id));
}

export async function updateBench(id: number, patch: Partial<Pick<BenchRecord, "condition" | "area" | "notes" | "photo_path">>) {
  check(await supabase.from("benches").update(patch).eq("id", id));
}

const PHOTO_BUCKET = "bench-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Upload a new photo, point the bench at it, then remove the old file.
export async function replaceBenchPhoto(bench: BenchRecord, file: File) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photos must be 5 MB or smaller.");

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${bench.code}/${Date.now()}.${ext}`;
  check(await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type }));
  await updateBench(bench.id, { photo_path: path });
  if (bench.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([bench.photo_path]);
  return path;
}

export async function removeBenchPhoto(bench: BenchRecord) {
  if (!bench.photo_path) return;
  await updateBench(bench.id, { photo_path: null });
  await supabase.storage.from(PHOTO_BUCKET).remove([bench.photo_path]);
}
