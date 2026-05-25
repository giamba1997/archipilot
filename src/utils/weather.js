// ── Enrichissements zero-effort de la visite ──────────────
//
// Géoloc silencieuse + météo automatique via Open-Meteo (gratuit,
// pas de clé API, ~10 req/s soft limit largement suffisant pour
// notre usage). Utilisés au démarrage d'une visite Mode Chantier
// pour pré-remplir des données qui finiront dans le brouillon PV
// et le journal de chantier RGPT (légalement utile en Belgique).

const WMO_LABELS = {
  0:  { label: "Ciel clair", emoji: "☀️" },
  1:  { label: "Plutôt clair", emoji: "🌤️" },
  2:  { label: "Partiellement nuageux", emoji: "⛅" },
  3:  { label: "Couvert", emoji: "☁️" },
  45: { label: "Brouillard", emoji: "🌫️" },
  48: { label: "Brouillard givrant", emoji: "🌫️" },
  51: { label: "Bruine légère", emoji: "🌦️" },
  53: { label: "Bruine", emoji: "🌦️" },
  55: { label: "Bruine dense", emoji: "🌧️" },
  56: { label: "Bruine verglaçante", emoji: "🌧️" },
  57: { label: "Bruine verglaçante dense", emoji: "🌧️" },
  61: { label: "Pluie légère", emoji: "🌧️" },
  63: { label: "Pluie", emoji: "🌧️" },
  65: { label: "Pluie forte", emoji: "🌧️" },
  66: { label: "Pluie verglaçante", emoji: "🌧️" },
  67: { label: "Pluie verglaçante forte", emoji: "🌧️" },
  71: { label: "Neige légère", emoji: "🌨️" },
  73: { label: "Neige", emoji: "🌨️" },
  75: { label: "Neige forte", emoji: "❄️" },
  77: { label: "Grains de neige", emoji: "❄️" },
  80: { label: "Averses légères", emoji: "🌦️" },
  81: { label: "Averses", emoji: "🌧️" },
  82: { label: "Averses violentes", emoji: "⛈️" },
  85: { label: "Averses de neige", emoji: "🌨️" },
  86: { label: "Fortes averses de neige", emoji: "❄️" },
  95: { label: "Orage", emoji: "⛈️" },
  96: { label: "Orage avec grêle", emoji: "⛈️" },
  99: { label: "Orage violent", emoji: "⛈️" },
};

// Position GPS silencieuse — résout null si refusé, indisponible
// ou timeout (timeoutMs default 6s). Pas de popup intrusif d'erreur
// pour l'archi : l'enrichissement est "best effort", la visite
// fonctionne sans.
export function getCurrentPositionSafe(timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
        capturedAt: new Date().toISOString(),
      }),
      () => finish(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
    // Belt-and-suspenders : Safari ne respecte pas toujours le timeout
    setTimeout(() => finish(null), timeoutMs + 500);
  });
}

// Fetch météo courante via Open-Meteo. Retourne null si pas de
// coords ou erreur réseau — l'appelant ne doit jamais bloquer
// l'expérience sur ce fetch.
export async function fetchWeatherAt(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    const code = c.weather_code;
    const info = WMO_LABELS[code] || { label: "Conditions inconnues", emoji: "🌡️" };
    return {
      temperature: Math.round(c.temperature_2m),
      weatherCode: code,
      label: info.label,
      emoji: info.emoji,
      capturedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("Open-Meteo fetch failed:", err);
    return null;
  }
}

// Format court pour l'affichage en chip header : "☀️ 18°C".
export function formatWeatherShort(weather) {
  if (!weather || typeof weather.temperature !== "number") return "";
  return `${weather.emoji || ""} ${weather.temperature}°C`.trim();
}
