import axios from "axios";

// Keep the browser and API on the same hostname for local cookie sessions.
export const API =
  import.meta.env.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:8001`;
export default axios.create({ withCredentials: true, timeout: 120000 });
