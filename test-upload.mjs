import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://vijrrcimntzzmbhcbpcl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpanJyY2ltbnR6em1iaGNicGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDc0NTEsImV4cCI6MjA5MTA4MzQ1MX0.gSh4L4oLZwMXxyqHI508p5WGayzAcM34pkRS0S6J0SI"
);

// List buckets
const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
console.log("Buckets:", buckets?.map(b => `${b.name} (public: ${b.public})`), bErr?.message);

// Try uploading as anon (will fail — need auth)
const { data: { user } } = await supabase.auth.getUser();
console.log("User:", user?.id || "not logged in");

// Try listing files
const { data: files, error: fErr } = await supabase.storage.from("project-files").list();
console.log("Files:", files, fErr?.message);
