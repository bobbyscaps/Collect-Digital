-- PR4 security: atomic challenge consume + wallet verify (single transaction).

create or replace function public.complete_wallet_ownership_verification(
  p_challenge_id uuid,
  p_profile_id uuid,
  p_wallet_id uuid,
  p_verified_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.wallet_verification_challenges%rowtype;
  v_existing public.wallet_verification_challenges%rowtype;
  v_wallet public.profile_wallets%rowtype;
begin
  update public.wallet_verification_challenges as c
  set consumed_at = p_verified_at
  where c.id = p_challenge_id
    and c.profile_id = p_profile_id
    and c.wallet_id = p_wallet_id
    and c.consumed_at is null
    and c.expires_at > p_verified_at
  returning * into v_challenge;

  if not found then
    select * into v_existing
    from public.wallet_verification_challenges
    where id = p_challenge_id;

    if not found then
      raise exception 'challenge_not_found'
        using errcode = 'P0002';
    end if;

    if v_existing.profile_id is distinct from p_profile_id
       or v_existing.wallet_id is distinct from p_wallet_id then
      raise exception 'challenge_not_found'
        using errcode = 'P0002';
    end if;

    if v_existing.consumed_at is not null then
      raise exception 'consumed_challenge'
        using errcode = 'P0001';
    end if;

    if v_existing.expires_at <= p_verified_at then
      raise exception 'expired_challenge'
        using errcode = 'P0001';
    end if;

    raise exception 'challenge_not_found'
      using errcode = 'P0002';
  end if;

  update public.profile_wallets as w
  set
    verification_status = 'verified',
    verified_at = p_verified_at,
    updated_at = p_verified_at
  where w.id = p_wallet_id
    and w.profile_id = p_profile_id
  returning * into v_wallet;

  if not found then
    raise exception 'wallet_not_found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'challenge', to_jsonb(v_challenge),
    'wallet', to_jsonb(v_wallet)
  );
end;
$$;

revoke all on function public.complete_wallet_ownership_verification(uuid, uuid, uuid, timestamptz)
  from public;
grant execute on function public.complete_wallet_ownership_verification(uuid, uuid, uuid, timestamptz)
  to service_role;
