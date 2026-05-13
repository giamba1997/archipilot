export const formatAddress = (p) => {
  if (p.street || p.city) {
    const line1 = [p.street, p.number].filter(Boolean).join(" ");
    const line2 = [p.postalCode, p.city].filter(Boolean).join(" ");
    return [line1, line2, p.country !== "Belgique" ? p.country : ""].filter(Boolean).join(", ");
  }
  return p.address || "";
};

// buildMapsUrl — URL d'itinéraire vers une adresse ou des coordonnées GPS.
// Pourquoi pas `geo:` : ce scheme marche sur Android mais pas iOS Safari.
// `https://maps.google.com/?q=...` est universel (iOS l'ouvre dans Plans
// par défaut si Google Maps n'est pas installé, sinon dans Google Maps).
// L'utilisateur peut aussi long-press le lien pour choisir son app de nav.
export const buildMapsUrl = (projectOrAddress) => {
  let query = "";
  if (typeof projectOrAddress === "string") {
    query = projectOrAddress;
  } else if (projectOrAddress?.geo?.lat && projectOrAddress?.geo?.lng) {
    // Coordonnées GPS exactes — préférables car pas d'ambiguïté de géocodage
    query = `${projectOrAddress.geo.lat},${projectOrAddress.geo.lng}`;
  } else if (projectOrAddress) {
    query = formatAddress(projectOrAddress);
  }
  query = query.trim();
  if (!query) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
};

export const parseAddress = (addr) => {
  if (!addr) return { street: "", number: "", postalCode: "", city: "", country: "Belgique" };
  const parts = addr.split(",").map(s => s.trim());
  if (parts.length >= 2) {
    const streetPart = parts[0];
    const cityPart = parts[parts.length - 1];
    const streetMatch = streetPart.match(/^(.+?)\s+(\d+\w*)$/);
    const cityMatch = cityPart.match(/^(\d{4,5})?\s*(.+)$/);
    return {
      street: streetMatch ? streetMatch[1] : streetPart,
      number: streetMatch ? streetMatch[2] : "",
      postalCode: cityMatch?.[1] || "",
      city: cityMatch?.[2] || cityPart,
      country: "Belgique",
    };
  }
  return { street: "", number: "", postalCode: "", city: addr, country: "Belgique" };
};
