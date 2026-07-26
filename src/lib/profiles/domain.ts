/**
 * Collect Digital internal profile identity.
 *
 * - `id` (profileId): internal UUID used as FK throughout product tables
 * - `privyUserId`: external Privy JWT subject — authentication identifier only
 *
 * Never use the Privy DID as a database foreign key.
 */

export interface CollectorProfileRecord {
  id: string;
  privyUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectorProfileInput {
  privyUserId: string;
}
