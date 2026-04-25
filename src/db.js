import { supabase } from "./supabase";

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
    pdfColor: data.pdf_color || "#C95A1B",
    pdfFont: data.pdf_font || "helvetica",
    apiKey: data.api_key || "",
    lang: data.lang || "fr",
    postTemplate: data.post_template || "general",
    pvTemplate: data.pv_template || "standard",
    remarkNumbering: data.remark_numbering || "none",
    plan: data.plan || "free",
    onboardingCompletedAt: data.onboarding_completed_at || null,
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
      post_template: profile.postTemplate,
      pv_template: profile.pvTemplate,
      remark_numbering: profile.remarkNumbering,
      plan: profile.plan || "free",
      onboarding_completed_at: profile.onboardingCompletedAt || null,
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
  console.log("[Respond] User:", user.id, user.email, "memberId:", memberId, "accept:", accept);

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

  console.log("[Respond] Update result:", { data, error });
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
  if (!user) { console.log("[Shared] No user"); return []; }
  console.log("[Shared] User:", user.id, user.email);

  // Get all accepted memberships
  const { data: memberships, error: mErr } = await supabase
    .from("project_members")
    .select("project_id, owner_id, role, status, user_id, invited_email")
    .eq("user_id", user.id)
    .eq("status", "accepted");

  console.log("[Shared] Memberships query:", { memberships, error: mErr });

  // Also check if there are any memberships at all for this email (even pending)
  const { data: allByEmail } = await supabase
    .from("project_members")
    .select("id, project_id, owner_id, role, status, user_id, invited_email")
    .eq("invited_email", user.email?.toLowerCase());
  console.log("[Shared] All memberships by email:", allByEmail);

  if (mErr || !memberships?.length) { console.log("[Shared] No accepted memberships found"); return []; }

  // Group by owner
  const ownerIds = [...new Set(memberships.map(m => m.owner_id))];
  const shared = [];

  for (const ownerId of ownerIds) {
    console.log("[Shared] Loading user_data for owner:", ownerId);
    const { data: ownerData, error: odErr } = await supabase
      .from("user_data")
      .select("projects")
      .eq("user_id", ownerId)
      .single();

    console.log("[Shared] Owner data:", { hasProjects: !!ownerData?.projects, projectCount: ownerData?.projects?.length, error: odErr });
    if (!ownerData?.projects) continue;

    const ownerMemberships = memberships.filter(m => m.owner_id === ownerId);
    for (const mem of ownerMemberships) {
      const project = ownerData.projects.find(p => String(p.id) === String(mem.project_id));
      console.log("[Shared] Matching project_id:", mem.project_id, "found:", !!project);
      if (project) {
        shared.push({ ...project, _shared: true, _ownerId: ownerId, _role: mem.role });
      }
    }
  }

  console.log("[Shared] Final result:", shared.length, "projects");
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

  if (res.error) throw new Error(res.error.message || "Erreur lors de la suppression");

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
