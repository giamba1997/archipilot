import { supabase } from "./supabase";
import { markDirty, markSynced } from "./utils/offline";

// supabase-js wraps non-2xx Edge Function responses in a FunctionsHttpError
// whose .message is generic ("Edge Function returned a non-2xx status code").
// The actual JSON body (where our user-facing messages + structured codes live)
// is on .context. Returns the parsed body when available, else a fallback.
export async function parseFunctionError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body) return body;
  } catch { /* body not JSON or already consumed */ }
  return { error: error?.message || "Erreur inconnue" };
}

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
  // F7 — Marque la donnée comme "dirty" immédiatement (avant le debounce)
  // pour que le badge de sync reflète l'attente correctement.
  markDirty();

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
    else markSynced();
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
    pdfColor: data.pdf_color || "#C95A1B",
    pdfFont: data.pdf_font || "helvetica",
    // Note : api_key (champ user OpenAI BYO-key) supprimé du chargement —
    // l'app utilise désormais OPENAI_API_KEY côté edge function uniquement.
    lang: data.lang || "fr",
    postTemplate: data.post_template || "general",
    pvTemplate: data.pv_template || "standard",
    remarkNumbering: data.remark_numbering || "none",
    plan: data.plan || "free",
    onboardingCompletedAt: data.onboarding_completed_at || null,
    // F1 — émetteur de factures
    iban: data.iban || "",
    vatNumber: data.vat_number || "",
    invoicePaymentTermsDays: data.invoice_payment_terms_days ?? 30,
    invoicePaymentNote: data.invoice_payment_note || "",
    // F5 — alertes (objet par catégorie, défaut côté DB via JSONB)
    alertSettings: data.alert_settings || {
      reception_definitive: true,
      reserve_overdue:      true,
      permit_deadline:      true,
      task_overdue:         true,
      invoice_overdue:      true,
      no_pv_30d:            false,
      email_digest:         false,
    },
    // Mobile Étape 4 — préférences push (kill-switch + toggles par catégorie)
    pushSettings: data.push_settings || {
      enabled:   true,
      opr:       true,
      permits:   true,
      reserves:  true,
      invoices:  true,
      collab:    true,
      reception: true,
    },
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
      // api_key intentionnellement non écrit — voir loadProfile
      lang: profile.lang,
      post_template: profile.postTemplate,
      pv_template: profile.pvTemplate,
      remark_numbering: profile.remarkNumbering,
      plan: profile.plan || "free",
      onboarding_completed_at: profile.onboardingCompletedAt || null,
      iban: profile.iban || null,
      vat_number: profile.vatNumber || null,
      invoice_payment_terms_days: profile.invoicePaymentTermsDays ?? 30,
      invoice_payment_note: profile.invoicePaymentNote || null,
      alert_settings: profile.alertSettings || undefined,
      push_settings: profile.pushSettings || undefined,
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
  const path = `${user.id}/photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const blob = dataUrlToBlob(dataUrl);

  const { error } = await supabase.storage
    .from("project-files")
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (error) { console.error("[Storage] Upload error:", error); return null; }

  const { data: urlData } = supabase.storage
    .from("project-files")
    .getPublicUrl(path);

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
  // Prefer dataUrl for immediate local display, then storage URL
  if (photo.dataUrl) return photo.dataUrl;
  if (photo.url) return photo.url;
  if (photo.storagePath) {
    const { data } = supabase.storage.from("project-files").getPublicUrl(photo.storagePath);
    return data.publicUrl;
  }
  return "";
}

// ── Collaboration ──────────────────────────────────────────

export async function inviteMember(projectId, ownerId, email, role, projectName, inviterName) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check if already invited
  const { data: existing } = await supabase
    .from("project_members")
    .select("id, status")
    .eq("project_id", String(projectId))
    .eq("owner_id", ownerId)
    .eq("invited_email", email.toLowerCase())
    .single();

  if (existing) return { error: "already_invited" };

  // Find if user exists in profiles
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("email", email.toLowerCase())
    .single();

  const { data, error } = await supabase
    .from("project_members")
    .insert({
      project_id: String(projectId),
      owner_id: ownerId,
      user_id: targetProfile?.id || null,
      role,
      invited_by: user.id,
      invited_email: email.toLowerCase(),
      invited_name: targetProfile?.name || "",
      status: "pending",
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Create notification for target user if they exist
  if (targetProfile?.id) {
    await supabase.from("notifications").insert({
      user_id: targetProfile.id,
      type: "invite",
      project_id: String(projectId),
      project_name: projectName,
      actor_id: user.id,
      actor_name: inviterName,
      data: { role, member_id: data.id },
    });
  }

  // Send invitation email via Edge Function
  try {
    await supabase.functions.invoke("send-invite-email", {
      body: { email: email.toLowerCase(), projectName, inviterName, role },
    });
  } catch (e) {
    console.error("Failed to send invite email:", e);
    // Non-blocking — invitation is still created
  }

  return { data };
}

export async function loadProjectMembers(projectId, ownerId) {
  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", String(projectId))
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) { console.error("loadProjectMembers error:", error); return []; }
  return data || [];
}

export async function updateMemberRole(memberId, role) {
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("id", memberId);
  if (error) console.error("updateMemberRole error:", error);
  return !error;
}

export async function removeMember(memberId) {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("id", memberId);
  if (error) console.error("removeMember error:", error);
  return !error;
}

export async function loadMyInvitations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("invited_email", user.email.toLowerCase())
    .eq("status", "pending");

  if (error) { console.error("loadMyInvitations error:", error); return []; }
  return data || [];
}

export async function respondToInvitation(memberId, accept) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.error("[Respond] No user"); return false; }

  const { data, error } = await supabase
    .from("project_members")
    .update({
      status: accept ? "accepted" : "declined",
      user_id: user.id,
      accepted_at: accept ? new Date().toISOString() : null,
    })
    .eq("id", memberId)
    .select()
    .single();

  if (error) { console.error("[Respond] Error:", error); return false; }

  // Notify the project owner
  if (accept && data) {
    const profile = await loadProfile();
    await supabase.from("notifications").insert({
      user_id: data.owner_id,
      type: "invite_accepted",
      project_id: data.project_id,
      project_name: "",
      actor_id: user.id,
      actor_name: profile?.name || user.email,
      data: { member_id: data.id },
    });
  }

  return true;
}

export async function loadSharedProjects() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get all accepted memberships
  const { data: memberships, error: mErr } = await supabase
    .from("project_members")
    .select("project_id, owner_id, role, status, user_id, invited_email")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  if (mErr || !memberships?.length) return [];

  // Group by owner
  const ownerIds = [...new Set(memberships.map(m => m.owner_id))];
  const shared = [];

  for (const ownerId of ownerIds) {
    const { data: ownerData } = await supabase
      .from("user_data")
      .select("projects")
      .eq("user_id", ownerId)
      .single();

    if (!ownerData?.projects) continue;

    const ownerMemberships = memberships.filter(m => m.owner_id === ownerId);
    for (const mem of ownerMemberships) {
      const project = ownerData.projects.find(p => String(p.id) === String(mem.project_id));
      if (project) {
        shared.push({ ...project, _shared: true, _ownerId: ownerId, _role: mem.role });
      }
    }
  }

  return shared;
}

// ── Notifications ──────────────────────────────────────────

export async function loadNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error("loadNotifications error:", error); return []; }
  return data || [];
}

export async function markNotificationRead(id) {
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
}

export async function deleteNotification(id) {
  await supabase.from("notifications").delete().eq("id", id);
}

// ── Web Push (Mobile Étape 4) ──────────────────────────────
//
// Déclenche l'envoi d'une notification push à l'utilisateur authentifié.
// Non bloquant : si l'edge function échoue (VAPID pas configuré, sub
// expirée…), la notif cloche en DB reste bien créée — l'archi la verra
// quand il rouvrira l'app. La push est une couche en plus.
//
// Le caller (côté client) passe target_user_id pour SES propres push.
// L'edge function force target_user_id = self quand le JWT est un user
// token, donc target_user_id est seulement respecté par le service role
// (appels inter-fonctions).
export async function triggerPushNotification({
  category,    // "opr" | "permits" | "reserves" | "invoices" | "collab" | "reception"
  title,
  body,
  deep_link,
  data,
}) {
  try {
    await supabase.functions.invoke("send-push-notification", {
      body: { category, title, body, deep_link, data },
    });
  } catch (e) {
    // Non bloquant — toute erreur push doit être silencieuse côté UX.
    console.warn("triggerPushNotification failed (non-blocking):", e);
  }
}

export async function deleteAllNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("notifications").delete().eq("user_id", user.id);
}

export function subscribeToNotifications(userId, callback) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `user_id=eq.${userId}`,
    }, (payload) => callback(payload.new))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ── Comments ───────────────────────────────────────────────

export async function loadComments(projectId, ownerId, postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("project_id", String(projectId))
    .eq("owner_id", ownerId)
    .eq("post_id", String(postId))
    .order("created_at", { ascending: true });

  if (error) { console.error("loadComments error:", error); return []; }
  return data || [];
}

export async function createComment(projectId, ownerId, postId, remarkIndex, body) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await loadProfile();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      project_id: String(projectId),
      owner_id: ownerId,
      post_id: String(postId),
      remark_index: remarkIndex,
      author_id: user.id,
      author_name: profile?.name || "",
      author_picture: profile?.picture || null,
      body,
    })
    .select()
    .single();

  if (error) { console.error("createComment error:", error); return null; }
  return data;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) console.error("deleteComment error:", error);
  return !error;
}

// ── PV Distribution ────────────────────────────────────────

// Lance l'extraction structurée du cahier des charges via l'Edge Function
// parse-cdc. Retourne { posts, obligations, attendus, parsedAt } ou
// { upgradeRequired } / { error }. Le caller décide quoi appliquer au projet.
export async function parseCdc({ extractedText, projectName, projectType }) {
  if (!extractedText?.trim()) return { error: "Aucun texte à analyser." };
  const { data, error } = await supabase.functions.invoke("parse-cdc", {
    body: { extractedText, projectName, projectType },
  });
  if (error) {
    console.error("parseCdc error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") {
      return { upgradeRequired: body };
    }
    // Cas typique : la fonction n'est pas (encore) déployée → supabase-js
    // remonte un message générique "Failed to send a request to the Edge
    // Function". On le reformule pour qu'il soit actionnable.
    const raw = body.error || error?.message || "";
    if (/Failed to send a request|Function not found|404/i.test(raw)) {
      return { error: "La fonction d'analyse n'est pas disponible (Edge Function non déployée). Réessaie dans un instant ou contacte le support." };
    }
    return { error: raw || "Erreur d'analyse du cahier des charges." };
  }
  if (data?.error) return { error: data.error };
  return {
    posts: Array.isArray(data?.posts) ? data.posts : [],
    obligations: Array.isArray(data?.obligations) ? data.obligations : [],
    attendus: Array.isArray(data?.attendus) ? data.attendus : [],
    parsedAt: data?.parsedAt || new Date().toISOString(),
  };
}

export async function sendPvByEmail({ to, projectName, pvNumber, pvDate, pvContent, authorName, structureName, pdfBase64, pdfFileName, subject, customMessage }) {
  const pvId = `${projectName.replace(/\s+/g, "_")}-${pvNumber}`;

  const { data, error } = await supabase.functions.invoke("send-pv-email", {
    body: { to, projectName, pvNumber, pvDate, pvContent, authorName, structureName, pdfBase64, pdfFileName, pvId, subject, customMessage },
  });

  if (error) {
    console.error("sendPvByEmail error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") {
      return { upgradeRequired: body };
    }
    return { error: body.error || "Erreur d'envoi" };
  }

  // Record the send
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("pv_sends").insert({
      project_id: projectName,
      pv_number: pvNumber,
      sent_by: user.id,
      sent_to: to,
      resend_id: data?.id || "",
    });
  }

  return { success: true, sentTo: to };
}

// OPR mirrors PV email infra. Same Edge Function with kind="opr" — only the
// email template labels differ. Skips pv_sends recording (OPR sends live in
// the project's oprHistory entry, not in a dedicated table for now).
export async function sendOprByEmail({ to, projectName, oprNumber, oprDate, authorName, structureName, pdfBase64, pdfFileName, subject, customMessage }) {
  const oprId = `OPR-${projectName.replace(/\s+/g, "_")}-${oprNumber}`;

  const { data, error } = await supabase.functions.invoke("send-pv-email", {
    body: {
      to,
      projectName,
      pvNumber: oprNumber,
      pvDate: oprDate,
      pvContent: "",
      authorName,
      structureName,
      pdfBase64,
      pdfFileName,
      pvId: oprId,
      subject,
      customMessage,
      kind: "opr",
    },
  });

  if (error) {
    console.error("sendOprByEmail error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") {
      return { upgradeRequired: body };
    }
    return { error: body.error || "Erreur d'envoi" };
  }

  return { success: true, sentTo: to, resendId: data?.id || "" };
}

// ── OPR signing à distance ──────────────────────────────────
// Crée N demandes de signature pour un OPR donné. L'Edge Function gère
// l'envoi des emails personnalisés + insertion DB.
export async function requestOprSignatures({ projectId, projectName, opr, signatories, pdfBase64, pdfFileName, authorName, structureName, customMessage }) {
  const { data, error } = await supabase.functions.invoke("request-opr-signatures", {
    body: { projectId, projectName, opr, signatories, pdfBase64, pdfFileName, authorName, structureName, customMessage },
  });
  if (error) {
    console.error("requestOprSignatures error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") return { upgradeRequired: body };
    return { error: body.error || "Erreur d'envoi" };
  }
  if (data?.error) return { error: data.error };
  return { success: true, requests: data?.requests || [], delivery: data?.delivery || [] };
}

// Charge les demandes de signature pour un projet (ou pour un OPR spécifique).
// Côté architecte, RLS s'occupe de filtrer par owner_user_id.
export async function loadOprSignatureRequests(projectId, oprId) {
  let q = supabase.from("opr_signature_requests").select("*").order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", String(projectId));
  if (oprId) q = q.eq("opr_id", String(oprId));
  const { data, error } = await q;
  if (error) { console.error("loadOprSignatureRequests error:", error); return []; }
  return data || [];
}

// ── Bibliothèque de réserves types (F8) ─────────────────────
// Charge tous les modèles visibles pour l'utilisateur : ses modèles perso,
// les modèles partagés de son agence, et les modèles système (seed).
// RLS filtre côté serveur — on récupère tout en une requête. Trié par
// fréquence d'usage décroissante pour que l'autocomplete propose
// d'abord les plus utilisés.
export async function loadReserveTemplates() {
  const { data, error } = await supabase
    .from("reserve_templates")
    .select("*")
    .order("usage_count", { ascending: false })
    .order("description", { ascending: true });
  if (error) { console.error("loadReserveTemplates error:", error); return []; }
  return data || [];
}

// Crée ou met à jour un modèle perso (ou org si org_id fourni).
// `template` : { id?, description, default_severity, default_contractor_type, category, org_id? }
// Renvoie le modèle persisté (avec id généré si nouveau), ou null en cas d'erreur.
export async function saveReserveTemplate(template) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = {
    description: template.description?.trim(),
    default_severity: template.default_severity || 'major',
    default_contractor_type: template.default_contractor_type || null,
    category: template.category || null,
  };
  if (!payload.description) return null;

  if (template.id) {
    // UPDATE existant
    const { data, error } = await supabase
      .from("reserve_templates")
      .update(payload)
      .eq("id", template.id)
      .select()
      .single();
    if (error) { console.error("saveReserveTemplate update error:", error); return null; }
    return data;
  }

  // INSERT — modèle perso par défaut, ou org si template.org_id fourni
  const insertPayload = {
    ...payload,
    owner_user_id: template.org_id ? null : user.id,
    org_id: template.org_id || null,
    is_system: false,
  };
  const { data, error } = await supabase
    .from("reserve_templates")
    .insert(insertPayload)
    .select()
    .single();
  if (error) { console.error("saveReserveTemplate insert error:", error); return null; }
  return data;
}

export async function deleteReserveTemplate(id) {
  const { error } = await supabase
    .from("reserve_templates")
    .delete()
    .eq("id", id);
  if (error) { console.error("deleteReserveTemplate error:", error); return false; }
  return true;
}

// Incrémente le compteur d'usage d'un modèle (et met à jour last_used_at).
// Fire-and-forget : on n'attend pas la réponse pour ne pas bloquer l'UI
// au moment où l'archi sauvegarde sa réserve.
export function incrementReserveTemplateUsage(id) {
  if (!id) return;
  supabase.rpc("increment_reserve_template_usage", { _template_id: id })
    .then(({ error }) => {
      if (error) console.error("incrementReserveTemplateUsage error:", error);
    });
}

// ── Honoraires & facturation (F1) ───────────────────────────
// Charge les factures visibles : ses factures perso + celles de son agence
// si l'utilisateur est membre. RLS filtre côté serveur.
export async function loadInvoices({ projectId } = {}) {
  let q = supabase
    .from("invoices")
    .select("*")
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", String(projectId));
  const { data, error } = await q;
  if (error) { console.error("loadInvoices error:", error); return []; }
  return data || [];
}

// Réserve un numéro de facture séquentiel pour l'année donnée.
// Atomique côté serveur (verrou pessimiste dans le RPC). Renvoie "2026-001".
export async function nextInvoiceNumber(year) {
  const y = year || new Date().getFullYear();
  const { data, error } = await supabase.rpc("next_invoice_number", { _year: y });
  if (error) { console.error("nextInvoiceNumber error:", error); return null; }
  return data;
}

// Crée ou met à jour une facture. L'archi peut fournir `number` manuellement
// (reprise d'une numérotation existante), sinon on en réserve un nouveau.
// Retourne la facture persistée ou null en cas d'erreur.
export async function saveInvoice(invoice) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const isUpdate = !!invoice.id;
  const payload = {
    project_id:     String(invoice.project_id),
    project_name:   invoice.project_name || null,
    phase_id:       invoice.phase_id || null,
    phase_label:    invoice.phase_label || null,
    client_name:    invoice.client_name?.trim(),
    client_address: invoice.client_address?.trim() || null,
    client_vat:     invoice.client_vat?.trim() || null,
    description:    invoice.description?.trim(),
    amount_ht:      Number(invoice.amount_ht) || 0,
    vat_rate:       Number(invoice.vat_rate) || 21,
    issue_date:     invoice.issue_date,
    due_date:       invoice.due_date,
    status:         invoice.status || "draft",
    payment_method: invoice.payment_method || null,
    payment_ref:    invoice.payment_ref || null,
    notes:          invoice.notes || null,
  };

  if (!payload.client_name || !payload.description) return null;

  if (isUpdate) {
    // status-driven timestamps : on n'écrase pas si déjà set
    if (invoice.status === "sent" && !invoice._wasSent) payload.sent_at = new Date().toISOString();
    if (invoice.status === "paid" && !invoice._wasPaid) payload.paid_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", invoice.id)
      .select()
      .single();
    if (error) { console.error("saveInvoice update error:", error); return null; }
    return data;
  }

  // INSERT — réserver un numéro si pas fourni
  let number = invoice.number?.trim();
  if (!number) {
    const year = new Date(invoice.issue_date || Date.now()).getFullYear();
    number = await nextInvoiceNumber(year);
    if (!number) return null;
  }

  const insertPayload = {
    ...payload,
    owner_user_id: invoice.org_id ? null : user.id,
    org_id: invoice.org_id || null,
    number,
  };
  const { data, error } = await supabase
    .from("invoices")
    .insert(insertPayload)
    .select()
    .single();
  if (error) { console.error("saveInvoice insert error:", error); return null; }
  return data;
}

export async function deleteInvoice(id) {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) { console.error("deleteInvoice error:", error); return false; }
  return true;
}

// ── Permis d'urbanisme (F4) ─────────────────────────────────
export async function loadPermits({ projectId } = {}) {
  let q = supabase
    .from("permits")
    .select("*")
    .order("depot_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (projectId) q = q.eq("project_id", String(projectId));
  const { data, error } = await q;
  if (error) { console.error("loadPermits error:", error); return []; }
  return data || [];
}

export async function savePermit(permit) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = {
    project_id:     String(permit.project_id),
    project_name:   permit.project_name || null,
    permit_type:    permit.permit_type || 'urbanisme',
    procedure:      permit.procedure || '75j',
    procedure_days: permit.procedure_days || null,
    reference:      permit.reference?.trim() || null,
    commune:        permit.commune?.trim() || null,
    depot_date:     permit.depot_date || null,
    ar_date:        permit.ar_date || null,
    deadline_date:  permit.deadline_date || null,
    decision_date:  permit.decision_date || null,
    decision_text:  permit.decision_text?.trim() || null,
    status:         permit.status || 'preparation',
    documents:      permit.documents || [],
    notes:          permit.notes?.trim() || null,
  };

  if (permit.id) {
    const { data, error } = await supabase
      .from("permits").update(payload).eq("id", permit.id).select().single();
    if (error) { console.error("savePermit update error:", error); return null; }
    return data;
  }

  const insertPayload = {
    ...payload,
    owner_user_id: permit.org_id ? null : user.id,
    org_id: permit.org_id || null,
  };
  const { data, error } = await supabase
    .from("permits").insert(insertPayload).select().single();
  if (error) { console.error("savePermit insert error:", error); return null; }
  return data;
}

export async function deletePermit(id) {
  const { error } = await supabase.from("permits").delete().eq("id", id);
  if (error) { console.error("deletePermit error:", error); return false; }
  return true;
}

// ── Devis / soumissions (F3) ────────────────────────────────
export async function loadQuotes({ projectId, lotId } = {}) {
  let q = supabase
    .from("quotes")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (projectId) q = q.eq("project_id", String(projectId));
  if (lotId) q = q.eq("lot_id", String(lotId));
  const { data, error } = await q;
  if (error) { console.error("loadQuotes error:", error); return []; }
  return data || [];
}

export async function saveQuote(quote) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = {
    project_id:       String(quote.project_id),
    lot_id:           quote.lot_id || null,
    lot_label:        quote.lot_label || null,
    contractor_name:  quote.contractor_name?.trim() || "Entreprise inconnue",
    contractor_email: quote.contractor_email?.trim() || null,
    file_name:        quote.file_name || null,
    file_data_url:    quote.file_data_url || null,
    total_ht:         quote.total_ht ?? null,
    total_ttc:        quote.total_ttc ?? null,
    validity_days:    quote.validity_days ?? null,
    parsed:           quote.parsed || {},
    parse_status:     quote.parse_status || 'pending',
    parse_error:      quote.parse_error || null,
    status:           quote.status || 'pending',
    notes:            quote.notes || null,
  };

  if (quote.id) {
    if (quote.status === "awarded" && !quote._wasAwarded) payload.awarded_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("quotes").update(payload).eq("id", quote.id).select().single();
    if (error) { console.error("saveQuote update error:", error); return null; }
    return data;
  }

  const insertPayload = {
    ...payload,
    owner_user_id: quote.org_id ? null : user.id,
    org_id: quote.org_id || null,
  };
  const { data, error } = await supabase
    .from("quotes").insert(insertPayload).select().single();
  if (error) { console.error("saveQuote insert error:", error); return null; }
  return data;
}

export async function deleteQuote(id) {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) { console.error("deleteQuote error:", error); return false; }
  return true;
}

// Appelle l'edge function parse-quote (OpenAI Vision).
// Le client envoie soit `text` (extrait via pdf.js), soit `imagesBase64`
// (fallback pour les PDFs scannés).
export async function parseQuotePdf({ text, imagesBase64, contractorHint }) {
  const { data, error } = await supabase.functions.invoke("parse-quote", {
    body: { text, imagesBase64, contractorHint },
  });
  if (error) {
    console.error("parseQuotePdf error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") return { upgradeRequired: body };
    return { error: body.error || "Erreur de parsing IA" };
  }
  if (data?.error) return { error: data.error };
  return { parsed: data };
}

// ── Rapports d'avancement (F10) ─────────────────────────────
export async function loadProgressReports({ projectId } = {}) {
  let q = supabase
    .from("progress_reports")
    .select("*")
    .order("period_end", { ascending: false });
  if (projectId) q = q.eq("project_id", String(projectId));
  const { data, error } = await q;
  if (error) { console.error("loadProgressReports error:", error); return []; }
  return data || [];
}

export async function saveProgressReport(report) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = {
    project_id:    String(report.project_id),
    project_name:  report.project_name || null,
    period_start:  report.period_start,
    period_end:    report.period_end,
    content_md:    report.content_md || null,
    content_html:  report.content_html || null,
    pdf_url:       report.pdf_url || null,
    status:        report.status || "draft",
    sent_to:       report.sent_to || null,
  };

  if (report.id) {
    if (report.status === "sent" && !report._wasSent) payload.sent_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("progress_reports").update(payload).eq("id", report.id).select().single();
    if (error) { console.error("saveProgressReport update error:", error); return null; }
    return data;
  }

  const insertPayload = {
    ...payload,
    owner_user_id: report.org_id ? null : user.id,
    org_id: report.org_id || null,
  };
  const { data, error } = await supabase
    .from("progress_reports").insert(insertPayload).select().single();
  if (error) { console.error("saveProgressReport insert error:", error); return null; }
  return data;
}

export async function deleteProgressReport(id) {
  const { error } = await supabase.from("progress_reports").delete().eq("id", id);
  if (error) { console.error("deleteProgressReport error:", error); return false; }
  return true;
}

// Appelle l'edge function generate-progress-report (OpenAI synthesis)
export async function generateProgressReportContent({ project_name, status_label, period_start, period_end, pvs, tasks, reserves, photos_count, permits }) {
  const { data, error } = await supabase.functions.invoke("generate-progress-report", {
    body: { project_name, status_label, period_start, period_end, pvs, tasks, reserves, photos_count, permits },
  });
  if (error) {
    console.error("generateProgressReportContent error:", error);
    const body = await parseFunctionError(error);
    if (body.code === "plan_upgrade_required") return { upgradeRequired: body };
    return { error: body.error || "Erreur de génération IA" };
  }
  if (data?.error) return { error: data.error };
  return { content_md: data.content_md };
}

export async function loadPvSends(projectId, pvNumber) {
  const { data, error } = await supabase
    .from("pv_sends")
    .select("*")
    .eq("project_id", projectId)
    .eq("pv_number", pvNumber)
    .order("sent_at", { ascending: false });

  if (error) { console.error("loadPvSends error:", error); return []; }
  return data || [];
}

export async function loadPvReads(pvId) {
  const { data, error } = await supabase
    .from("pv_reads")
    .select("*")
    .eq("pv_id", pvId)
    .order("read_at", { ascending: false });

  if (error) { console.error("loadPvReads error:", error); return []; }
  return data || [];
}

// ── Analytics ─────────────────────────────────────────────

let _sessionId = null;
function getSessionId() {
  if (!_sessionId) _sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  return _sessionId;
}

// Batched analytics — flush every 5 seconds
let _eventBuffer = [];
let _flushTimer = null;
let _userId = null;

async function flushEvents() {
  if (_eventBuffer.length === 0) return;
  const batch = _eventBuffer.splice(0);
  try {
    await supabase.from("analytics_events").insert(batch);
  } catch (e) {
    // Non-blocking
  }
}

export function track(event, properties = {}) {
  try {
    if (!_userId) {
      supabase.auth.getUser().then(({ data: { user } }) => { if (user) _userId = user.id; });
      return;
    }
    const device = typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
    _eventBuffer.push({
      user_id: _userId,
      event,
      properties,
      device,
      page: properties._page || "",
      session_id: getSessionId(),
    });
    if (!_flushTimer) {
      _flushTimer = setInterval(() => { flushEvents(); }, 5000);
    }
    // Flush immediately for important events
    if (["login", "pv_generated", "pv_sent", "project_created", "plan_selected"].includes(event)) {
      flushEvents();
    }
  } catch (e) {
    // Non-blocking
  }
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => flushEvents());
}

// ── Stripe: Checkout & Portal ────────────────────────────────

export async function createCheckoutSession(plan, period = "month") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke("stripe-checkout", {
    body: { plan, period },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) throw new Error(res.error.message || "Erreur lors de la création du checkout");
  if (res.data?.url) {
    window.location.href = res.data.url;
  } else {
    throw new Error("Pas d'URL de checkout reçue");
  }
}

export async function openBillingPortal() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke("stripe-portal", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) throw new Error(res.error.message || "Erreur lors de l'ouverture du portail");
  if (res.data?.url) {
    window.location.href = res.data.url;
  } else {
    throw new Error("Pas d'URL de portail reçue");
  }
}

// ── GDPR: Export & Delete Account ────────────────────────────

export async function exportUserData() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke("export-data", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) throw new Error(res.error.message || "Erreur lors de l'export");

  // Download the JSON file
  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `archipilot-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function deleteAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke("delete-account", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) {
    // Extract the structured body (e.g. { code: "owner_of_orgs", orgs: [...] })
    // so the caller can show an in-place fix-it UI instead of just a message.
    const parsed = await parseFunctionError(res.error);
    const err = new Error(parsed?.error || res.error.message || "Erreur lors de la suppression");
    if (parsed?.code) err.code = parsed.code;
    if (parsed?.orgs) err.orgs = parsed.orgs;
    throw err;
  }

  // Clear local data
  try {
    localStorage.removeItem("archipilot_projects");
    localStorage.removeItem("archipilot_activeId");
    localStorage.removeItem("archipilot_profile");
    localStorage.removeItem("archipilot_offline_queue");
    localStorage.removeItem("archipilot_pv_drafts");
    localStorage.removeItem("archipilot_cookie_consent");
  } catch { /* ignore */ }

  // Sign out
  await supabase.auth.signOut();
}

// ── Organizations (Team plan tenants) ──────────────────────
//
// An "organization" groups several seats (architects of the same firm)
// around a shared workspace. Personal projects keep using user_data;
// shared projects live in organization_data. The client merges both
// when needed.

export async function createOrganization(name) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke("create-org", {
    body: { name },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) {
    const parsed = await parseFunctionError(res.error);
    throw new Error(parsed?.error || "Création de l'agence impossible");
  }
  return res.data?.organization;
}

export async function loadMyOrganizations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select(`
      role,
      joined_at,
      org:organizations (
        id, name, plan, seat_limit, status, grace_period_ends_at,
        owner_user_id, created_at
      )
    `)
    .eq("user_id", user.id);

  if (error) { console.error("loadMyOrganizations:", error); return []; }
  return (data || [])
    .filter(row => row.org)
    .map(row => ({ ...row.org, _myRole: row.role, _joinedAt: row.joined_at }));
}

export async function loadOrgMembers(orgId) {
  // Two-step fetch — auth.users isn't directly readable, so we join via
  // profiles.id (which mirrors auth.users.id).
  const { data: members, error: mErr } = await supabase
    .from("organization_members")
    .select("user_id, role, joined_at, invited_by")
    .eq("org_id", orgId);

  if (mErr) { console.error("loadOrgMembers:", mErr); return []; }
  if (!members?.length) return [];

  const userIds = members.map(m => m.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, name, email, picture_url")
    .in("id", userIds);

  if (pErr) console.error("loadOrgMembers profiles:", pErr);

  const profById = new Map((profiles || []).map(p => [p.id, p]));
  return members.map(m => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    invited_by: m.invited_by,
    name: profById.get(m.user_id)?.name || "",
    email: profById.get(m.user_id)?.email || "",
    avatar: profById.get(m.user_id)?.picture_url || null,
  }));
}

export async function loadOrgProjects(orgId) {
  const { data, error } = await supabase
    .from("organization_data")
    .select("projects, active_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) { console.error("loadOrgProjects:", error); return null; }
  if (!data) return { projects: [], activeId: null };
  return { projects: data.projects || [], activeId: data.active_id };
}

let orgSaveTimer = null;
export function saveOrgProjects(orgId, projects, activeId) {
  // Mirror saveProjects()'s 1.5s debounce so multi-client edits don't hammer
  // the DB. The latest call wins — fine for the single-active-window
  // scenario; we'll layer presence/lock logic on top in Phase 4.
  clearTimeout(orgSaveTimer);
  orgSaveTimer = setTimeout(async () => {
    const { error } = await supabase
      .from("organization_data")
      .upsert({ org_id: orgId, projects, active_id: activeId }, { onConflict: "org_id" });
    if (error) console.error("saveOrgProjects:", error);
  }, 1500);
}

// ── Org invitations & member management ────────────────────

async function invokeOrgFn(name, body, fallback) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const res = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) {
    const parsed = await parseFunctionError(res.error);
    throw new Error(parsed?.error || fallback);
  }
  return res.data;
}

export async function inviteOrgMember(orgId, email, role) {
  return invokeOrgFn("invite-org-member", { org_id: orgId, email, role }, "Invitation impossible");
}

export async function acceptOrgInvite(token) {
  return invokeOrgFn("accept-org-invite", { token }, "Invitation invalide");
}

export async function revokeOrgInvite(invitationId) {
  return invokeOrgFn("revoke-org-invite", { invitation_id: invitationId }, "Révocation impossible");
}

export async function removeOrgMember(orgId, userId) {
  return invokeOrgFn("remove-org-member", { org_id: orgId, user_id: userId }, "Suppression impossible");
}

export async function transferOrgOwnership(orgId, newOwnerUserId) {
  return invokeOrgFn("transfer-org-ownership", { org_id: orgId, new_owner_user_id: newOwnerUserId }, "Transfert impossible");
}

export async function leaveOrg(orgId) {
  return invokeOrgFn("leave-org", { org_id: orgId }, "Sortie impossible");
}

// Delete an org (owner only). Cascades to members, invitations, data.
// Goes through the supabase client; RLS only allows the owner to delete.
export async function deleteOrganization(orgId) {
  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);
  if (error) throw new Error(error.message || "Suppression de l'agence impossible");
}

export async function loadPendingOrgInvitations(orgId) {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, invited_by, expires_at, created_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("loadPendingOrgInvitations:", error); return []; }
  return data || [];
}

// Find a pending invitation addressed to the currently-logged-in user.
// Returns the freshest one if multiple exist. Used as a server-side
// fallback when the URL/localStorage token has been lost (cross-device
// signup, cleared cache, etc.). RLS ensures users only see their own.
export async function loadPendingInvitationForMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("token, org_id, role, expires_at")
    .eq("status", "pending")
    .ilike("email", user.email)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { console.error("loadPendingInvitationForMe:", error); return null; }
  return data;
}
