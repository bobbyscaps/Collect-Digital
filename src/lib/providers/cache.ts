import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

interface MemoryCacheEntry {
  expiresAt: number;
  value: unknown;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

function getAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function getProviderCache<T>(
  cacheKey: string
): Promise<T | null> {
  const inMemory = memoryCache.get(cacheKey);
  if (inMemory && inMemory.expiresAt > Date.now()) {
    return inMemory.value as T;
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("provider_cache_entries")
    .select("value, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (!data) {
    return null;
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  memoryCache.set(cacheKey, {
    value: data.value,
    expiresAt: new Date(data.expires_at).getTime(),
  });
  return data.value as T;
}

export async function setProviderCache<T>(
  cacheKey: string,
  value: T,
  ttlMs: number,
  provider: string
) {
  const expiresAt = Date.now() + ttlMs;
  memoryCache.set(cacheKey, { value, expiresAt });

  const supabase = getAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("provider_cache_entries").upsert({
    cache_key: cacheKey,
    provider,
    value,
    expires_at: new Date(expiresAt).toISOString(),
    updated_at: new Date().toISOString(),
  });
}
