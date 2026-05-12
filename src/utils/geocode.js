// ── F9 — Géocodage via Nominatim (OpenStreetMap) ─────────────
// Gratuit, sans clé API. Rate-limit officiel : 1 req/seconde, on
// le respecte via une file d'attente locale (sinon ban IP possible).
//
// Cache localStorage : on évite de re-géocoder la même adresse à chaque
// ouverture de la carte. Les coordonnées sont aussi stockées dans
// project.geo côté DB pour partage entre devices.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_KEY = "archipilot:geocache:v1";

// Lecture / écriture du cache localStorage. Forme : { [normalized]: { lat, lng, at } }
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch { /* quota — ignore */ }
}

const normalize = (addr) => (addr || "").toLowerCase().replace(/\s+/g, " ").trim();

// File d'attente — un seul géocodage à la fois pour respecter rate limit
let queue = Promise.resolve();
function enqueue(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {}); // ne pas casser la chaîne sur erreur
  return p;
}

// Géocode une adresse texte. Renvoie { lat, lng } ou null.
// `country` (défaut "be") restreint à la Belgique pour réduire les
// ambiguïtés sur les noms de rue communs.
export async function geocodeAddress(address, { country = "be" } = {}) {
  if (!address || !address.trim()) return null;
  const key = normalize(address);

  // Cache hit
  const cache = loadCache();
  if (cache[key]) return { lat: cache[key].lat, lng: cache[key].lng, cached: true };

  return enqueue(async () => {
    // Pause 1s pour respecter le rate limit Nominatim
    await new Promise(r => setTimeout(r, 1100));
    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", address);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", country);

      const res = await fetch(url.toString(), {
        // Politesse Nominatim : envoyer un Referer permet d'identifier l'app
        // si jamais on dépasse les limites.
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        console.warn("Nominatim error:", res.status);
        return null;
      }
      const data = await res.json();
      const first = Array.isArray(data) && data[0];
      if (!first) return null;
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      if (isNaN(lat) || isNaN(lng)) return null;

      // Cache + return
      cache[key] = { lat, lng, at: Date.now() };
      saveCache(cache);
      return { lat, lng, cached: false };
    } catch (e) {
      console.warn("geocodeAddress failed:", e);
      return null;
    }
  });
}

// Batch — géocode plusieurs adresses séquentiellement (rate-limit safe).
// Appelle `onProgress({ done, total, project })` au fur et à mesure.
export async function geocodeProjects(projects, { onProgress } = {}) {
  const results = {};
  const todo = projects.filter(p => !p.geo && (p.address || p.city));
  let done = 0;
  for (const p of todo) {
    const addr = p.address || p.city;
    const coords = await geocodeAddress(addr);
    if (coords) results[p.id] = { ...coords, at: new Date().toISOString() };
    done++;
    onProgress?.({ done, total: todo.length, project: p });
  }
  return results;
}
