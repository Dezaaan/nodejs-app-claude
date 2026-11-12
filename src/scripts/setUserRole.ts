// Changes a user's role. Run by an operator, never exposed through the API:
//   npm run user:set-role -- <email> <role>               (development)
//   node dist/scripts/setUserRole.js <email> <role>        (built / Docker)
// The change takes effect at the user's next token refresh (within the access
// token lifetime), or immediately on their next login.
import { createContainer } from "../app/container.js";
import { createConfig } from "../config/config.js";
import { createEnv } from "../config/env.js";
import { isRole, ROLES } from "../shared/auth/permissions.js";

const [email, role] = process.argv.slice(2);

if (!email || !isRole(role)) {
  console.error(`Usage: npm run user:set-role -- <email> <${ROLES.join("|")}>`);

  process.exit(1);
}

const container = createContainer(createConfig(createEnv()));

try {
  const user = await container.features.auth.service.setRole(email, role);

  console.log(`${user.email} is now "${user.role}"`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);

  process.exitCode = 1;
} finally {
  await container.infrastructure.database.close();
}
