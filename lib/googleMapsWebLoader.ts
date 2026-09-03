let mapsLoadPromise: Promise<void> | null = null;

function getGoogleMapsKey(): string {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for web maps rendering."
    );
  }
  return key;
}

export function loadGoogleMapsApi(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      "tara-google-maps-sdk"
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Maps script failed to load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "tara-google-maps-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      getGoogleMapsKey()
    )}&libraries=places&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Google Maps JavaScript API."));
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}
