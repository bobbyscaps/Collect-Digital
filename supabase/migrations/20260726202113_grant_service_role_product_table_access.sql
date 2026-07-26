-- Corrective: service_role bypasses RLS but still needs table DML privileges.
-- Browser roles (anon, authenticated) remain fully denied.
-- Enables server-side Collect Digital repositories that use the service role key.

revoke all on table
  public.profiles,
  public.profile_wallets,
  public.wallet_verification_challenges,
  public.wallet_holdings,
  public.wallet_inventory_syncs,
  public.provider_cache_entries
from anon, authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.profile_wallets,
  public.wallet_verification_challenges,
  public.wallet_holdings,
  public.wallet_inventory_syncs,
  public.provider_cache_entries
to service_role;
