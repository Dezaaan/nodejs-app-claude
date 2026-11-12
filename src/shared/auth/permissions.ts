// The single place that decides what each role may do. The frontend receives
// the resulting permissions and only uses them to show or hide things.

export const ROLES = ["user", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = "user";

export type Permission = "notes.view" | "notes.edit";

const ROLE_PERMISSIONS = {
  user: ["notes.view", "notes.edit"],
  viewer: ["notes.view"],
} as const satisfies Record<Role, readonly Permission[]>;

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

export const getPermissions = (role: Role): Permission[] => [
  ...ROLE_PERMISSIONS[role],
];

export const hasPermission = (role: Role, permission: Permission): boolean =>
  (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
