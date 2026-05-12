import { useCallback, useRef, useState } from "react";

// useGeolocation — accès opt-in à la position de l'archi via l'API Geolocation.
//
// Pattern : on NE demande PAS la permission au montage (intrusif). Le caller
// invoque `request()` quand l'archi clique sur un CTA explicite (« Voir
// chantiers proches »). La position est ensuite cachée en localStorage pour
// 30 min — évite de re-prompter à chaque navigation.
//
// État exposé :
//   coords     : { lat, lng } | null
//   status     : "idle" | "requesting" | "granted" | "denied" | "unavailable"
//   error      : message UX-friendly
//   request()  : déclenche la demande de permission + getCurrentPosition
//
// Note : on n'utilise PAS `watchPosition`. Sur PWA mobile en foreground le
// coût batterie n'est pas critique, mais pour notre besoin (afficher 3
// chantiers proches), une snapshot suffit.

const CACHE_KEY = "archipilot_geo_cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.ts || !v?.coords) return null;
    if (Date.now() - v.ts > CACHE_TTL) return null;
    return v.coords;
  } catch {
    return null;
  }
}

function writeCache(coords) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ coords, ts: Date.now() }));
  } catch { /* quota */ }
}

export function useGeolocation() {
  const [coords, setCoords] = useState(() => readCache());
  const [status, setStatus] = useState(() => readCache() ? "granted" : "idle");
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const request = useCallback(() => {
    if (inFlight.current) return;
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Géolocalisation non disponible sur ce navigateur.");
      return;
    }
    inFlight.current = true;
    setStatus("requesting");
    setError("");
    navigator.geolocation.getCurrentPosition(
      pos => {
        inFlight.current = false;
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        writeCache(c);
        setStatus("granted");
      },
      err => {
        inFlight.current = false;
        if (err.code === 1) {
          setStatus("denied");
          setError("Accès à la position refusé.");
        } else if (err.code === 2) {
          setStatus("unavailable");
          setError("Position introuvable.");
        } else {
          setStatus("idle");
          setError("Délai d'attente dépassé.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  // Note : pas de useEffect pour relire le cache — readCache() est déjà
  // appelé par les initializers de useState, ce qui suffit.

  return { coords, status, error, request };
}

// haversineKm — distance entre 2 points GPS en km (formule de Haversine).
// Précision suffisante pour trier 5-30 chantiers par proximité.
export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
