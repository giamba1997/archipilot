import { useState, useEffect } from "react";
import { SB, SBB, TX, TX3, WH } from "../constants/tokens";
import { Ico } from "../components/ui";

export function WeatherWidget({ address }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    (async () => {
      try {
        // Extract city from address — try last parts (e.g. "Rue X 12, 1000 Bruxelles" → "Bruxelles")
        const parts = address.split(",").map(s => s.trim());
        const searchTerms = [
          parts[parts.length - 1],  // last part (usually city)
          parts.length > 1 ? parts[parts.length - 1].replace(/^\d+\s*/, "") : null, // remove postal code
          address, // full address as fallback
        ].filter(Boolean);

        let loc = null;
        for (const term of searchTerms) {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=1&language=fr`);
          const geoData = await geoRes.json();
          loc = geoData?.results?.[0];
          if (loc) break;
        }
        if (!loc) { setLoading(false); return; }

        // Get weather
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=auto`);
        const wData = await wRes.json();
        const c = wData?.current;
        if (!c) { setLoading(false); return; }

        const codes = { 0: "Ciel dégagé", 1: "Principalement dégagé", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine modérée", 55: "Bruine forte", 61: "Pluie légère", 63: "Pluie modérée", 65: "Pluie forte", 71: "Neige légère", 73: "Neige modérée", 75: "Neige forte", 80: "Averses légères", 81: "Averses modérées", 82: "Averses fortes", 95: "Orage", 96: "Orage grêle" };
        const icons = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌧️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "🌨️", 80: "🌦️", 81: "🌧️", 82: "🌧️", 95: "⛈️", 96: "⛈️" };

        setWeather({
          temp: Math.round(c.temperature_2m),
          desc: codes[c.weather_code] || "—",
          icon: icons[c.weather_code] || "🌡️",
          wind: Math.round(c.wind_speed_10m),
          humidity: c.relative_humidity_2m,
          lat: loc.latitude,
          lon: loc.longitude,
          city: loc.name,
        });
      } catch (e) { console.error("Weather fetch error:", e); }
      setLoading(false);
    })();
  }, [address]);

  if (loading || !weather) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: WH, border: `1px solid ${SBB}`, borderRadius: 10 }}>
      <span style={{ fontSize: 28 }}>{weather.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: TX }}>{weather.temp}°C</span>
          <span style={{ fontSize: 11, color: TX3 }}>{weather.desc}</span>
        </div>
        <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>
          Vent {weather.wind} km/h · Humidité {weather.humidity}% · {weather.city}
        </div>
      </div>
      <a href={`https://www.google.com/maps?q=${weather.lat},${weather.lon}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, background: SB, border: `1px solid ${SBB}`, textDecoration: "none" }} title="Voir sur Google Maps">
        <Ico name="mappin" size={13} color={TX3} />
      </a>
    </div>
  );
}
