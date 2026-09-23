import type { Metadata } from "next";
import StaffApp from "@/components/staff/StaffApp";

export const metadata: Metadata = {
  title: "Staff · Adopt-a-Bench",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return <StaffApp />;
}
