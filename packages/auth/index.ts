import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { env } from '@nexus/config';

export const auth = betterAuth({
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: {
    type: 'postgres',
    url: env().DATABASE_URL,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;

// ── Org-scoped middleware helper ──────────────────────────────────
//
// Every API endpoint must validate orgId against the authenticated
// user's organisation. This helper enforces that at the middleware
// level, not per-handler.
//

export async function requireOrgAccess(
  session: Session,
  orgId: string
): Promise<void> {
  const orgMembership = session.session.activeOrganizationId;
  if (orgMembership !== orgId) {
    throw new Error('Forbidden: user does not belong to this organisation');
  }
}
