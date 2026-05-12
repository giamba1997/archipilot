import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AC, ACL, ACL2, SB, SB2, SBB, TX, TX2, TX3, WH, RD, GR,
} from "../constants/tokens";
import { STATUSES, getStatus } from "../constants/statuses";
import { Ico } from "../components/ui";
import { geocodeProjects } from "../utils/geocode";

// ── F9 — Carte multi-projets ─────────────────────────────────
// Vue cross-projets. Leaflet + tuiles OpenStreetMap (gratuit, sans clé).
// Pin par projet, couleur selon statut. Click pin → drawer infos rapides.
// Filtres : statut.
//
// Géocodage : on appelle Nominatim au montage pour les projets qui n'ont
// pas encore de project.geo. Les coordonnées sont cachées en localStorage
// + persistées via setProjects (sauvegarde JSONB user_data).
//
// v1 : pas d'itinéraire optimal du jour — sera utile quand on aura un
// volume de chantiers actifs par archi qui le justifie.

const BRUSSELS = [50.8503, 4.3517]; // Vue par défaut (Belgique)

// Crée une icône Leaflet customisée pour chaque statut. On utilise un
// divIcon pour pouvoir styler en CSS-in-JS plutôt que des SVG en URL.
function makeIcon(color) {
  return L.divIcon({
    className: "ap-map-pin",
    iconSize: [26, 36],
    iconAnchor: [13, 34],
    popupAnchor: [0, -28],
    html: `
      <div style="
        width: 26px; height: 26px;
        background: ${color};
        border: 3px solid #fff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      "></div>
    `,
  });
}

export function MapDashboardView({ projects, setProjects, onBack, onSelectProject }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({}); // projectId → L.Marker
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [geocoding, setGeocoding] = useState({ done: 0, total: 0, running: false });

  // Init Leaflet (une seule fois)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(BRUSSELS, 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Filtrage projets (statut + archived + ont des coordonnées)
  const visibleProjects = useMemo(() => {
    return (projects || [])
      .filter(p => !p.archived)
      .filter(p => statusFilter === "all" || p.statusId === statusFilter)
      .filter(p => p.geo?.lat && p.geo?.lng);
  }, [projects, statusFilter]);

  // Lance le géocodage au montage pour les projets sans coordonnées.
  // On défère l'init setState à un microtask pour passer la règle
  // react-hooks/set-state-in-effect (les setState synchrones dans un effet
  // déclenchent des cascading renders).
  useEffect(() => {
    let cancelled = false;
    const todo = (projects || []).filter(p => !p.archived && !p.geo?.lat && (p.address || p.city));
    if (todo.length === 0) return;

    queueMicrotask(() => {
      if (cancelled) return;
      setGeocoding({ done: 0, total: todo.length, running: true });
    });
    geocodeProjects(todo, {
      onProgress: ({ done, total }) => {
        if (!cancelled) setGeocoding({ done, total, running: true });
      },
    }).then(results => {
      if (cancelled) return;
      // Persist coords dans project.geo
      setProjects(prev => prev.map(p => {
        if (results[p.id]) return { ...p, geo: { lat: results[p.id].lat, lng: results[p.id].lng, geocoded_at: results[p.id].at } };
        return p;
      }));
      setGeocoding(g => ({ ...g, running: false }));
    });

    return () => { cancelled = true; };
  }, [projects, setProjects]);

  // Met à jour les markers quand la liste visible change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Retirer markers qui ne sont plus visibles
    const visibleIds = new Set(visibleProjects.map(p => p.id));
    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!visibleIds.has(parseInt(id)) && !visibleIds.has(id)) {
        marker.remove();
        delete markersRef.current[id];
      }
    }

    // Ajouter / mettre à jour les markers visibles
    for (const p of visibleProjects) {
      if (markersRef.current[p.id]) continue;
      const s = getStatus(p.statusId);
      const marker = L.marker([p.geo.lat, p.geo.lng], { icon: makeIcon(s.color) })
        .addTo(map)
        .on("click", () => setSelected(p));
      markersRef.current[p.id] = marker;
    }

    // Fit bounds si on a des projets visibles
    if (visibleProjects.length > 0) {
      const bounds = L.latLngBounds(visibleProjects.map(p => [p.geo.lat, p.geo.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
    }
  }, [visibleProjects]);

  // Stats : combien de projets par statut (sur la totale, pas le filtre)
  const counts = useMemo(() => {
    const c = { all: 0 };
    for (const s of STATUSES) c[s.id] = 0;
    for (const p of (projects || [])) {
      if (p.archived) continue;
      c.all++;
      if (c[p.statusId] != null) c[p.statusId]++;
    }
    return c;
  }, [projects]);

  // Projets sans géolocalisation (info pour l'archi)
  const notMappable = (projects || []).filter(p => !p.archived && !p.geo?.lat).length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", animation: "fadeIn 0.2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: SB, border: `1px solid ${SBB}`, cursor: "pointer", padding: 7, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>
            <Ico name="back" color={TX2} size={16} />
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX }}>Carte des chantiers</div>
            <div style={{ fontSize: 12, color: TX3 }}>
              {visibleProjects.length}/{counts.all} projet{counts.all > 1 ? "s" : ""} géolocalisé{counts.all > 1 ? "s" : ""}
              {notMappable > 0 ? ` · ${notMappable} sans adresse` : ""}
              {geocoding.running ? ` · Géocodage ${geocoding.done}/${geocoding.total}…` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Filtres statut */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`Tous (${counts.all})`} />
        {STATUSES.map(s => counts[s.id] > 0 && (
          <FilterChip
            key={s.id}
            active={statusFilter === s.id}
            onClick={() => setStatusFilter(s.id)}
            label={`${s.label} (${counts[s.id]})`}
            dot={s.color}
          />
        ))}
      </div>

      {/* Layout : carte + drawer latéral */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          ref={containerRef}
          style={{
            flex: "1 1 600px",
            height: 520,
            borderRadius: 14,
            border: `1px solid ${SBB}`,
            overflow: "hidden",
            background: SB,
            minWidth: 320,
          }}
        />

        {/* Drawer projet sélectionné */}
        <div style={{ flex: "0 0 280px", maxWidth: "100%" }}>
          {selected ? (
            <div style={{ background: WH, border: `1px solid ${SBB}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: getStatus(selected.statusId).bg, color: getStatus(selected.statusId).color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {getStatus(selected.statusId).label}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}>
                  <Ico name="x" size={12} color={TX3} />
                </button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>{selected.name}</div>
              {selected.client && <div style={{ fontSize: 11, color: TX3, marginBottom: 2 }}>MO : {selected.client}</div>}
              {selected.address && <div style={{ fontSize: 11, color: TX3, marginBottom: 10 }}>{selected.address}</div>}
              <button
                onClick={() => onSelectProject?.(selected.id)}
                style={{ width: "100%", padding: "10px 14px", border: "none", borderRadius: 9, background: AC, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                Ouvrir le projet <Ico name="arrowr" size={12} color="#fff" />
              </button>
            </div>
          ) : (
            <div style={{ background: SB, border: `1px dashed ${SBB}`, borderRadius: 14, padding: 16, color: TX3, fontSize: 12, textAlign: "center" }}>
              Click sur un pin pour voir le détail
            </div>
          )}

          {notMappable > 0 && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: AMB_BG_FROM_TOKENS, border: `1px solid ${AM_FROM_TOKENS}33`, borderRadius: 8, fontSize: 11, color: TX2, lineHeight: 1.5 }}>
              <strong>{notMappable} projet{notMappable > 1 ? "s" : ""} sans adresse</strong> ne peuvent pas apparaître. Renseigne l'adresse dans le projet pour le voir ici.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FilterChip — pattern réutilisé ──
function FilterChip({ active, onClick, label, dot }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 11px",
        border: `1px solid ${active ? ACL2 : SBB}`,
        borderRadius: 999,
        background: active ? ACL : WH,
        color: active ? AC : TX2,
        fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}
      {label}
    </button>
  );
}

// Aliases locaux pour rester lisible (les noms de tokens varient légèrement)
const AMB_BG_FROM_TOKENS = "#F8E5BD";
const AM_FROM_TOKENS = "#C0791A";
