// Alamat backend diturunkan dari host yang sedang dibuka browser.
// - Di laptop: window.location.hostname = "localhost"  -> http://localhost:8000
// - Di HP (LAN): hostname = IP laptop, mis. "192.168.1.10" -> http://192.168.1.10:8000
// Jadi tidak perlu hardcode IP; cukup buka app dari HP lewat IP laptop.
// Override manual (opsional): set VITE_API_URL saat build/dev.
export const API =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000`
