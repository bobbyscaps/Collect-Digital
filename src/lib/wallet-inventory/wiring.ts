import { createEvmInventoryProvider } from "@/lib/wallet-inventory/adapters/evm";
import { createSolanaInventoryProvider } from "@/lib/wallet-inventory/adapters/solana";
import {
  createWalletInventoryProviderRegistry,
  type WalletInventoryProviderRegistry,
} from "@/lib/wallet-inventory/providers";
import {
  createWalletInventoryService,
  type WalletInventoryService,
} from "@/lib/wallet-inventory/service";
import { createSupabaseProfileWalletRepository } from "@/lib/profile-wallets/supabase-repository";
import { createSupabaseWalletInventoryRepository } from "@/lib/wallet-inventory/supabase-repository";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";

/**
 * Foundation inventory providers (PR5 stubs).
 * Return empty complete inventories until live Alchemy/Helius adapters are wired.
 * Must never fabricate holdings.
 */
export function createDefaultInventoryProviderRegistry(): WalletInventoryProviderRegistry {
  return createWalletInventoryProviderRegistry([
    createEvmInventoryProvider({ providerKey: "evm_inventory" }),
    createSolanaInventoryProvider({ providerKey: "solana_inventory" }),
  ]);
}

export function createDefaultWalletInventoryService(options?: {
  profileWallets?: ProfileWalletRepository;
  inventory?: WalletInventoryRepository;
  providers?: WalletInventoryProviderRegistry;
}): WalletInventoryService {
  const profileWallets =
    options?.profileWallets ?? createSupabaseProfileWalletRepository();
  const inventory =
    options?.inventory ?? createSupabaseWalletInventoryRepository();
  const providers =
    options?.providers ?? createDefaultInventoryProviderRegistry();

  return createWalletInventoryService({
    profileWallets,
    inventory,
    providers,
  });
}
