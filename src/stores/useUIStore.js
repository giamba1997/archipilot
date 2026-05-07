import { create } from "zustand";
import { track } from "../db";

const useUIStore = create((set) => ({
  view: "overview",
  sidebarOpen: true,
  captureSheet: false,
  gallerySheet: false,
  projectPicker: false,
  pickerTab: "projects",
  modal: null,
  modalData: null,
  showSearch: false,
  showNotifications: false,
  toast: null,
  // Chat IA — déclenché par <AskAiButton/> partout dans l'app.
  // chatPrefill : { message?, attachments?, sourceTag? } | null
  chatOpen: false,
  chatPrefill: null,

  setView: (v) => {
    set({ view: v });
    try { track("page_viewed", { _page: v }); } catch { /* ignore */ }
  },
  setSidebarOpen: (v) => set(state => ({ sidebarOpen: typeof v === "function" ? v(state.sidebarOpen) : v })),
  setCaptureSheet: (v) => set({ captureSheet: v }),
  setGallerySheet: (v) => set({ gallerySheet: v }),
  setProjectPicker: (v) => set(state => ({ projectPicker: typeof v === "function" ? v(state.projectPicker) : v })),
  setPickerTab: (v) => set({ pickerTab: v }),
  setModal: (v) => set({ modal: v }),
  setModalData: (v) => set({ modalData: v }),
  setShowSearch: (v) => set({ showSearch: v }),
  setShowNotifications: (v) => set(state => ({ showNotifications: typeof v === "function" ? v(state.showNotifications) : v })),
  showToast: (msg, type = "success") => {
    set({ toast: { msg, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },
  closeAllModals: () => set({ modal: null, showSearch: false, showNotifications: false }),
  // Ouvre le chat IA avec un prefill contextuel. Toujours opt-in (déclenché
  // par un bouton utilisateur, jamais automatiquement). Le `sourceTag` sert
  // à tracer d'où vient la demande (analytics + transparence dans le chat).
  askAi: (prefill) => {
    set({ chatOpen: true, chatPrefill: prefill || null });
    try { track("ai_button_clicked", { _source: prefill?.sourceTag || "unknown" }); } catch { /* ignore */ }
  },
  closeChat: () => set({ chatOpen: false, chatPrefill: null }),
  // Effacer le prefill sans fermer la modal — appelé une fois que ChatModal
  // l'a injecté dans le composer. Évite que le prefill réapparaisse à la
  // prochaine ouverture.
  clearChatPrefill: () => set({ chatPrefill: null }),
  // Ouvre/ferme le chat sans changer le prefill (utilisé par le launcher
  // flottant, qui ne porte aucune intention contextuelle).
  toggleChat: () => set(state => ({ chatOpen: !state.chatOpen })),
}));

export default useUIStore;
