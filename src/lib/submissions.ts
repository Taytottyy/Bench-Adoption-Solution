// Photos and messages about a bench (see supabase/migrations/*_bench_submissions.sql).
import { supabase } from "./supabase";

export type SubmissionTopic = "bench_photo" | "plaque" | "damage" | "question";
export type SubmissionStatus = "new" | "in_progress" | "resolved";

export const TOPICS: { value: SubmissionTopic; label: string; hint: string }[] = [
  { value: "bench_photo", label: "Photo of the bench", hint: "Share how your bench looks" },
  { value: "plaque", label: "Plaque", hint: "Installed, damaged, or a text change" },
  { value: "damage", label: "Repair needed", hint: "Broken slats, graffiti, litter…" },
  { value: "question", label: "Question", hint: "Anything else for park staff" },
];

export const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.value, t.label])) as Record<
  SubmissionTopic,
  string
>;

export const MAX_PHOTOS = 5;
const BUCKET = "submission-photos";
const MAX_EDGE = 2000; // px; phone photos are shrunk before upload

// Downscale large photos to JPEG in the browser so uploads are quick on mobile
// data and stay under the bucket's size limit. Falls back to the original file
// if the browser can't decode it.
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) return blob;
  } catch {
    // fall through
  }
  return file;
}

async function uploadPhoto(file: File): Promise<string> {
  const blob = await shrink(file);
  const type = blob.type || file.type;
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `uploads/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (error) throw new Error(`Couldn't upload ${file.name}: ${error.message}`);
  return path;
}

export async function submitBenchMessage(input: {
  benchId: number;
  topic: SubmissionTopic;
  name: string;
  email: string;
  message: string;
  photos: File[];
}) {
  const paths = await Promise.all(input.photos.slice(0, MAX_PHOTOS).map(uploadPhoto));
  const { data, error } = await supabase.rpc("submit_bench_message", {
    p_bench_id: input.benchId,
    p_topic: input.topic,
    p_contact_name: input.name,
    p_contact_email: input.email,
    p_message: input.message || null,
    p_photo_paths: paths,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

// ---------------------------------------------------------------------------
// Staff (enforced by row-level security)
// ---------------------------------------------------------------------------

export type Submission = {
  id: number;
  bench_id: number;
  topic: SubmissionTopic;
  message: string | null;
  contact_name: string;
  contact_email: string;
  photo_paths: string[];
  status: SubmissionStatus;
  staff_notes: string | null;
  created_at: string;
  benches: { code: string; area: string | null } | null;
};

export async function fetchSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase
    .from("bench_submissions")
    .select("*, benches(code, area)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Submission[];
}

export async function updateSubmission(
  id: number,
  patch: Partial<Pick<Submission, "status" | "staff_notes">>,
) {
  const { error } = await supabase.from("bench_submissions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// Private photos are shown to staff through short-lived signed links.
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(error.message);
  const urls: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}

// Copy a submitted photo into the public bench-photos bucket and make it the
// bench's photo (replacing any previous one).
export async function publishAsBenchPhoto(
  bench: { id: number; code: string; photo_path: string | null },
  path: string,
) {
  const ext = path.split(".").pop() ?? "jpg";
  const dest = `${bench.code}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).copy(path, dest, { destinationBucket: "bench-photos" });
  if (error) throw new Error(error.message);
  const { error: updateError } = await supabase.from("benches").update({ photo_path: dest }).eq("id", bench.id);
  if (updateError) throw new Error(updateError.message);
  if (bench.photo_path) await supabase.storage.from("bench-photos").remove([bench.photo_path]);
}
