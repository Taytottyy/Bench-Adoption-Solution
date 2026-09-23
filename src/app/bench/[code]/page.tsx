import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import BenchApp from "@/components/BenchApp";
import { STATUS_META, fetchBenchByCode, lastDay, photoUrl } from "@/lib/benches";

type Props = { params: Promise<{ code: string }> };

// Shared by generateMetadata and the page within one request.
const getBench = cache(async (code: string) => fetchBenchByCode(decodeURIComponent(code)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bench = await getBench((await params).code);
  if (!bench) return { title: "Bench not found · Van Cortlandt Park" };

  const title = `Bench ${bench.code} · Van Cortlandt Park`;
  const description =
    bench.status === "adopted"
      ? [
          `Adopted by ${bench.donor_name}`,
          bench.honoree && `in honor of ${bench.honoree}`,
          `through ${lastDay(bench.adopted_until)}.`,
        ]
          .filter(Boolean)
          .join(" ")
      : `${STATUS_META[bench.status].label}${bench.area ? ` · ${bench.area}` : ""}. Adopt a bench in Van Cortlandt Park.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: bench.photo_path ? [photoUrl(bench.photo_path)] : undefined,
    },
  };
}

export default async function BenchPage({ params }: Props) {
  const bench = await getBench((await params).code);
  if (!bench) notFound();
  return <BenchApp initialBenchId={bench.id} />;
}
