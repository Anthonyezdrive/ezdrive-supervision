export type UserRole = "admin" | "operator" | "tech";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  territory: string | null;
  created_at: string;
}
