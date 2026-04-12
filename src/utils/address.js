export const formatAddress = (p) => {
  if (p.street || p.city) {
    const line1 = [p.street, p.number].filter(Boolean).join(" ");
    const line2 = [p.postalCode, p.city].filter(Boolean).join(" ");
    return [line1, line2, p.country !== "Belgique" ? p.country : ""].filter(Boolean).join(", ");
  }
  return p.address || "";
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
