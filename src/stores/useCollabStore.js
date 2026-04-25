import { create } from "zustand";
import { loadSharedProjects, loadNotifications, loadMyInvitations, subscribeToNotifications } from "../db";
import { supabase } from "../supabase";

const useCollabStore = create((set) => ({
  sharedProjects: [],
  notifications: [],
  invitations: [],

  setSharedProjects: (v) => set({ sharedProjects: v }),
  setNotifications: (v) => set(state => ({
    notifications: typeof v === "function" ? v(state.notifications) : v,
  })),
  setInvitations: (v) => set(state => ({
    invitations: typeof v === "function" ? v(state.invitations) : v,
  })),

  loadAll: async () => {
    loadSharedProjects().then(v => set({ sharedProjects: v })).catch(() => {});
    loadNotifications().then(v => set({ notifications: v })).catch(() => {});
    loadMyInvitations().then(v => set({ invitations: v })).catch(() => {});
  },

  subscribeRealtime: () => {
    let unsub;
    try {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        unsub = subscribeToNotifications(user.id, (notif) => {
          set(state => ({ notifications: [notif, ...state.notifications] }));
          if (notif.type === "invite") {
            loadMyInvitations().then(v => set({ invitations: v })).catch(() => {});
          }
        });
      }).catch(() => {});
    } catch (e) { console.error("Notification subscription error:", e); }
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  },
}));

export default useCollabStore;
