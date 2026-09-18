export const apiBase = import.meta.env.VITE_BACKEND_URL || "";
export const apiUrl = (path) => `${apiBase}${path}`;
