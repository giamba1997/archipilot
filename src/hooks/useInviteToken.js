import { useState } from "react";

const KEY = "archipilot_pending_invite";

/**
 * Manage the org-invite token across the auth redirect chain.
 *
 * On first render, reads from `?invite=<token>` in the URL and persists
 * the value to localStorage so it survives Supabase's signup-confirmation
 * redirect (which strips the query string). Falls back to the persisted
 * value when the URL no longer carries the token.
 *
 * Returns:
 *   inviteToken — the current token, or null
 *   setInviteToken — for the server-side fallback path that finds a
 *     pending invitation by email lookup
 *   clearPendingInvite — call after the modal accepts or is dismissed
 *     so the token doesn't re-open the modal on the next mount
 */
export function useInviteToken() {
  const [inviteToken, setInviteToken] = useState(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("invite");
      if (fromUrl) {
        try { localStorage.setItem(KEY, fromUrl); } catch { /* ignore */ }
        return fromUrl;
      }
      return localStorage.getItem(KEY) || null;
    } catch { return null; }
  });

  const clearPendingInvite = () => {
    setInviteToken(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  return { inviteToken, setInviteToken, clearPendingInvite };
}
