import { createCollectorAnalysisService } from "@/lib/collector-analysis/service";
import { createCollectorIdentityAssetService } from "@/lib/collector-identity/assets";
import {
  createCollectorIdentityService,
  type CollectorIdentityService,
} from "@/lib/collector-identity/compose";
import { env } from "@/lib/env";
import { createSupabaseProfileWalletRepository } from "@/lib/profile-wallets/supabase-repository";
import { createSupabaseWalletInventoryRepository } from "@/lib/wallet-inventory/supabase-repository";

/**
 * Production wiring for Collector Identity.
 * Composes Supabase repositories → analysis → identity assembler.
 * Never imported by frontend client bundles.
 */
export function createDefaultCollectorIdentityService(): CollectorIdentityService {
  const profileWallets = createSupabaseProfileWalletRepository();
  const inventory = createSupabaseWalletInventoryRepository();
  const analysis = createCollectorAnalysisService({
    profileWallets,
    inventory,
  });
  const assetService = createCollectorIdentityAssetService({
    reservoirApiKey: env.RESERVOIR_API_KEY,
  });
  return createCollectorIdentityService({
    profileWallets,
    inventory,
    analysis,
    assetService,
  });
}
