import { useEffect, useState } from "react";

// useIsMobile — true quand la viewport est inférieure au breakpoint.
// 768 est le breakpoint historique de l'app (mobile bottom bar, etc.).
// On s'abonne au resize pour re-render quand l'archi pivote l'écran ou
// quand on simule mobile depuis le devtools.
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}
