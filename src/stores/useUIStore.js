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

  setView: (v) => {
    set({ view: v });
    try { track("page_viewed", { _page: v }); } catch {}
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
}));

export default useUIStore;
