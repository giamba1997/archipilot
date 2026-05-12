import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";

// useWebPushSubscription — gère l'abonnement Web Push de l'utilisateur.
//
// API exposée :
//   isSupported   : navigateur compatible Web Push (false sur iOS Safari < 16.4)
//   permission    : "default" | "granted" | "denied" | "unavailable"
//   isSubscribed  : true si une subscription existe pour ce SW
//   busy          : true pendant une opération (subscribe/unsubscribe)
//   error         : message UX-friendly (vide si pas d'erreur)
//   subscribe()   : demande la permission + crée la subscription + persiste en DB
//   unsubscribe() : retire la subscription côté SW + DB
//
// Flow technique :
//   1. Récupère le SW registration (vite-plugin-pwa l'expose via navigator.serviceWorker)
//   2. Appelle pushManager.subscribe avec applicationServerKey = VAPID_PUBLIC
//   3. Persiste { endpoint, p256dh, auth, user_agent } dans web_push_subscriptions
//
// VAPID public key : lue depuis import.meta.env.VITE_VAPID_PUBLIC_KEY,
// même clé que celle stockée en secret côté Supabase pour l'envoi.

const VAPID_PUBLIC_KEY = import.meta.env?.VITE_VAPID_PUBLIC_KEY || "";

// Convertit la clé VAPID base64url → Uint8Array (format attendu par pushManager.subscribe).
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function useWebPushSubscription() {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === "undefined") return "unavailable";
    return Notification.permission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSupported =
    typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && typeof Notification !== "undefined";

  // Vérifie au mount si l'utilisateur a déjà une subscription active
  // pour ce SW. Si oui, isSubscribed = true (sinon l'UI propose "Activer").
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch {
        // SW pas encore prêt — pas grave, l'UI montrera "Activer"
      }
    })();
    return () => { cancelled = true; };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setError("Notifications push non supportées sur ce navigateur.");
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      setError("Clé VAPID publique manquante (VITE_VAPID_PUBLIC_KEY).");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      // Demande la permission si pas déjà accordée
      let perm = Notification.permission;
      if (perm === "default") {
        perm = await Notification.requestPermission();
        setPermission(perm);
      }
      if (perm !== "granted") {
        setError(perm === "denied"
          ? "Permission refusée. Active les notifications dans les paramètres du navigateur."
          : "Permission non accordée.");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      // Fallback : certains navigateurs exposent les clés via getKey() au lieu
      // de toJSON().keys — on couvre les deux.
      const p256dh = json.keys?.p256dh
        || (sub.getKey ? arrayBufferToBase64(sub.getKey("p256dh")) : "");
      const auth = json.keys?.auth
        || (sub.getKey ? arrayBufferToBase64(sub.getKey("auth")) : "");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Utilisateur non authentifié.");
        return false;
      }

      const { error: upsertErr } = await supabase
        .from("web_push_subscriptions")
        .upsert({
          user_id:    user.id,
          endpoint:   sub.endpoint,
          p256dh_key: p256dh,
          auth_key:   auth,
          user_agent: navigator.userAgent || null,
        }, { onConflict: "user_id,endpoint" });

      if (upsertErr) {
        console.error("subscribe upsert error:", upsertErr);
        setError("Échec de l'enregistrement de l'abonnement.");
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error("subscribe error:", e);
      setError(e?.message || "Erreur lors de l'activation.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return false;
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        // Purge la ligne en DB (le cleanup serveur le ferait aussi via 410,
        // mais autant être propre côté client).
        await supabase
          .from("web_push_subscriptions")
          .delete()
          .eq("endpoint", endpoint);
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      console.error("unsubscribe error:", e);
      setError(e?.message || "Erreur lors de la désactivation.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    busy,
    error,
    subscribe,
    unsubscribe,
  };
}
