import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/**
 * Auth client phía trình duyệt (Client Component). `baseURL` để mặc định
 * (same-origin) vì app chỉ có một origin duy nhất.
 */
export const authClient = createAuthClient({
  plugins: [adminClient()],
});

export const { signIn, signOut, useSession } = authClient;
