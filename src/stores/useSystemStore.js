import { create } from "zustand";

const useSystemStore = create((set) => ({
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  showReconnected: false,
  installPrompt: null,
  storageWarning: false,

  setIsOnline: (v) => set({ isOnline: v }),
  setShowReconnected: (v) => set({ showReconnected: v }),
  setInstallPrompt: (v) => set({ installPrompt: v }),
  setStorageWarning: (v) => set({ storageWarning: v }),

  initListeners: () => {
    const goOnline = () => {
      set({ isOnline: true, showReconnected: true });
      setTimeout(() => set({ showReconnected: false }), 3000);
    };
    const goOffline = () => set({ isOnline: false });
    const pwaHandler = (e) => { e.preventDefault(); set({ installPrompt: e }); };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("beforeinstallprompt", pwaHandler);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeinstallprompt", pwaHandler);
    };
  },

  handleInstall: async () => {
    const { installPrompt } = useSystemStore.getState();
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") set({ installPrompt: null });
  },
}));

export default useSystemStore;
