export interface AuthUser {
  id: number;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string | null;
  title?: string | null;
  phone?: string | null;
  role: "admin" | "member";
  company_id: number;
  company_name?: string;
  company?: {
    id: number;
    legal_name: string;
    uei?: string | null;
    cage_code?: string | null;
  } | null;
}

const AUTH_STORAGE_KEY = "samgov-auth-user";

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function setStoredUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getUserDisplayName(user: AuthUser | null | undefined) {
  if (!user) return "";

  const fullName = user.full_name?.trim();
  if (fullName) return fullName;

  const firstLast = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (firstLast) return firstLast;

  return user.email;
}

export function getUserInitials(user: AuthUser | null | undefined) {
  const displayName = getUserDisplayName(user).trim();
  if (!displayName) return "U";

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
