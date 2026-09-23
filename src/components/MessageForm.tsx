"use client";

import { useEffect, useState } from "react";
import type { Bench } from "@/lib/benches";
import { MAX_PHOTOS, TOPICS, submitBenchMessage, type SubmissionTopic } from "@/lib/submissions";

export default function MessageForm({ bench, onCancel }: { bench: Bench; onCancel: () => void }) {
  const [topic, setTopic] = useState<SubmissionTopic>("bench_photo");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- previews derive from files and need cleanup
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [photos]);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => [...prev, ...images].slice(0, MAX_PHOTOS));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const message = String(f.get("message") ?? "").trim();
    if (photos.length === 0 && !message) {
      setError("Add a photo or a message.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitBenchMessage({
        benchId: bench.id,
        topic,
        name: String(f.get("name") ?? ""),
        email: String(f.get("email") ?? ""),
        message,
        photos,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-50 p-4 text-green-900">
          <p className="font-semibold">Sent to park staff — thank you!</p>
          <p className="mt-1 text-sm">They&apos;ll reply by email if they need anything else.</p>
        </div>
        <button onClick={onCancel} className="w-full rounded-lg border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50">
          Back to bench
        </button>
      </div>
    );
  }

  const input =
    "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700";
  const label = "block text-sm font-medium text-stone-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Send photos or a message</h3>
        <p className="text-sm text-stone-500">Goes straight to park staff, about bench {bench.code}.</p>
      </div>

      <fieldset>
        <legend className={label}>What&apos;s it about?</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {TOPICS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTopic(t.value)}
              aria-pressed={topic === t.value}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                topic === t.value ? "border-green-800 bg-green-50 text-green-900" : "border-stone-300 hover:bg-stone-50"
              }`}
            >
              <span className="block font-medium">{t.label}</span>
              <span className="block text-xs text-stone-500">{t.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <span className={label}>
          Photos <span className="font-normal text-stone-500">(up to {MAX_PHOTOS})</span>
        </span>
        <div className="mt-1 flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
              <img src={src} alt="" className="h-16 w-16 rounded-md object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-stone-400 text-stone-500 hover:bg-stone-50">
              <span className="text-xl leading-none">+</span>
              <span className="text-[10px]">Add</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>

      <label className={label}>
        Message
        <textarea name="message" rows={3} maxLength={2000} className={input} placeholder="e.g. The plaque was installed today — it looks great!" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Your name <span className="text-red-700">*</span>
          <input name="name" required maxLength={120} autoComplete="name" className={input} />
        </label>
        <label className={label}>
          Email <span className="text-red-700">*</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {submitting ? (photos.length ? "Uploading…" : "Sending…") : "Send"}
        </button>
      </div>
      <p className="text-xs text-stone-500">Photos and your contact details are only visible to park staff.</p>
    </form>
  );
}
