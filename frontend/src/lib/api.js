import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function apiError(e, fallback = "Something went wrong") {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((x) => x?.msg || "").filter(Boolean).join(" ");
  return e?.message || fallback;
}
