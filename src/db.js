import { supabase } from "./supabase";

// ── Projects (JSONB cloud sync) ────────────────────────────

export async function loadProjects() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_data")
    .select("projects, active_id")
    .eq("user_id", user.id)
    .single();

  if (error && error.code === "PGRST116") {
    // No row yet — first time user, create one
    await supabase.from("user_data").insert({ user_id: user.id, projects: [], active_id: 1 });
    return { projects: null, activeId: 1 };
  }
  if (error) { console.error("loadProjects error:", error); return null; }
  return { projects: data.projects, activeId: data.active_id };
}

let saveTimer = null;
export function saveProjects(projects, activeId) {
  // Debounce saves (1.5s) to avoid hammering the DB on every keystroke
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Strip base64 photos/plans for storage efficiency — keep URLs only
    // (For now we save everything; photos in Storage can be a future optimization)
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, projects, active_id: activeId }, { onConflict: "user_id" });

    if (error) console.error("saveProjects error:", error);
  }, 1500);
}

// ── Profile ────────────────────────────────────────────────

export async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) { console.error("loadProfile error:", error); return null; }

  return {
    name: data.name || "",
    structure: data.structure || "",
    structureType: data.structure_type || "architecte",
    address: data.address || "",
    phone: data.phone || "",
    email: data.email || user.email || "",
    picture: data.picture_url || null,
    pdfColor: data.pdf_color || "#D97B0D",
    pdfFont: data.pdf_font || "helvetica",
    apiKey: data.api_key || "",
    lang: data.lang || "fr",
  };
}

export async function saveProfile(profile) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      name: profile.name,
      structure: profile.structure,
      structure_type: profile.structureType,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      picture_url: profile.picture,
      pdf_color: profile.pdfColor,
      pdf_font: profile.pdfFont,
      api_key: profile.apiKey,
      lang: profile.lang,
    })
    .eq("id", user.id);

  if (error) console.error("saveProfile error:", error);
}

// ── Photo Storage ──────────────────────────────────────────

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function uploadPhoto(dataUrl) {
  console.log("[Storage] uploadPhoto called, dataUrl length:", dataUrl?.length);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.log("[Storage] No user, aborting"); return null; }
  console.log("[Storage] User:", user.id);

  const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
  const path = `${user.id}/photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const blob = dataUrlToBlob(dataUrl);
  console.log("[Storage] Uploading to:", path, "size:", blob.size);

  const { data, error } = await supabase.storage
    .from("project-files")
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (error) { console.error("[Storage] Upload error:", error); return null; }
  console.log("[Storage] Upload success:", data);

  const { data: urlData } = supabase.storage
    .from("project-files")
    .getPublicUrl(path);

  console.log("[Storage] Public URL:", urlData.publicUrl);
  return { storagePath: path, url: urlData.publicUrl };
}

export async function deletePhoto(storagePath) {
  if (!storagePath) return;
  const { error } = await supabase.storage
    .from("project-files")
    .remove([storagePath]);
  if (error) console.error("deletePhoto error:", error);
}

export function getPhotoUrl(photo) {
  // If the photo has a storage URL, use it; otherwise fall back to dataUrl (legacy/offline)
  if (photo.url) return photo.url;
  if (photo.storagePath) {
    const { data } = supabase.storage.from("project-files").getPublicUrl(photo.storagePath);
    return data.publicUrl;
  }
  return photo.dataUrl || "";
}
