import { createAccessControl } from "better-auth/plugins/access";

/** Các "statement" quyền theo tài nguyên của cửa hàng. */
const statement = {
  product: ["create", "read", "update", "delete"],
  order: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  product: ["create", "read", "update", "delete"],
  order: ["read", "update"],
});

export const staff = ac.newRole({
  product: ["read"],
  order: ["read", "update"],
});

export const roles = { owner, staff };
