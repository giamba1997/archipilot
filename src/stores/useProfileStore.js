import { create } from "zustand";
import { loadProfile as dbLoadProfile, saveProfile as dbSaveProfile } from "../db";
import { INIT_PROFILE } from "../constants/config";

const useProfileStore = create((set) => ({
  profile: INIT_PROFILE,
  profileSaved: false,

  setProfile: (data) => set({ profile: data }),

  saveProfile: (data) => {
    set({ profile: data, profileSaved: true });
    try { localStorage.setItem("archipilot_profile", JSON.stringify(data)); } catch {}
    dbSaveProfile(data);
    setTimeout(() => set({ profileSaved: false }), 2000);
  },

  loadFromDB: async () => {
    try {
      const cloudProfile = await dbLoadProfile().catch(e => { console.error("loadProfile failed:", e); return null; });
      if (cloudProfile) set({ profile: cloudProfile });
    } catch (e) { console.error("Profile load error:", e); }
  },
}));

export default useProfileStore;
