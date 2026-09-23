import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in web/.env.local",
  );
}

// Public pages only use the anon role; the staff dashboard signs in with the
// same client, so sessions are persisted (in the browser) by default.
export const supabase = createClient(url, key);
