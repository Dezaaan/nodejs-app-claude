import { describe, expect, it } from "vitest";
import {
  getPermissions,
  hasPermission,
  isRole,
} from "../../shared/auth/permissions.js";

describe("permissions", () => {
  it("lets users view and edit notes", () => {
    expect(getPermissions("user")).toEqual(["notes.view", "notes.edit"]);
    expect(hasPermission("user", "notes.edit")).toBe(true);
  });

  it("lets viewers only view notes", () => {
    expect(getPermissions("viewer")).toEqual(["notes.view"]);
    expect(hasPermission("viewer", "notes.view")).toBe(true);
    expect(hasPermission("viewer", "notes.edit")).toBe(false);
  });

  it("recognises only known roles", () => {
    expect(isRole("viewer")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("returns a copy that callers cannot use to change a role", () => {
    getPermissions("viewer").push("notes.edit");

    expect(hasPermission("viewer", "notes.edit")).toBe(false);
  });
});
