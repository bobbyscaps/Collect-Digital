import { createSupabaseProfileWalletRepository } from "@/lib/profile-wallets/supabase-repository";
import type { ProfileWalletRepository } from "@/lib/profile-wallets/repository";
import {
  createWalletRegistrationService,
  type WalletRegistrationService,
} from "@/lib/wallet-registration/service";
import {
  createWalletVerificationService,
  type WalletVerificationService,
} from "@/lib/wallet-verification/service";
import { createSupabaseWalletVerificationChallengeRepository } from "@/lib/wallet-verification/supabase-repository";
import { createSupabaseCompleteWalletVerification } from "@/lib/wallet-verification/supabase-completion";
import { createDefaultSignatureVerifier } from "@/lib/wallet-verification/verifiers/create-signature-verifier";
import {
  createDefaultWalletInventoryService,
  createDefaultInventoryProviderRegistry,
} from "@/lib/wallet-inventory/wiring";
import type { WalletInventoryService } from "@/lib/wallet-inventory/service";
import type { WalletVerificationChallengeRepository } from "@/lib/wallet-verification/repository";
import type { CompleteWalletVerification } from "@/lib/wallet-verification/completion";
import type { SignatureVerifier } from "@/lib/wallet-verification/signature-verifier";
import type { WalletInventoryProviderRegistry } from "@/lib/wallet-inventory/providers";
import type { WalletInventoryRepository } from "@/lib/wallet-inventory/repository";
import { createSupabaseWalletInventoryRepository } from "@/lib/wallet-inventory/supabase-repository";

/**
 * Production wiring for PR9 wallet registration, ownership verification,
 * and first inventory sync. Never imported by frontend client bundles.
 */

export type WalletVerificationFlowServices = {
  registration: WalletRegistrationService;
  verification: WalletVerificationService;
  inventory: WalletInventoryService;
  profileWallets: ProfileWalletRepository;
};

export function createWalletVerificationFlowServices(options?: {
  profileWallets?: ProfileWalletRepository;
  challenges?: WalletVerificationChallengeRepository;
  completeVerification?: CompleteWalletVerification;
  signatureVerifier?: SignatureVerifier;
  inventory?: WalletInventoryRepository;
  providers?: WalletInventoryProviderRegistry;
}): WalletVerificationFlowServices {
  const profileWallets =
    options?.profileWallets ?? createSupabaseProfileWalletRepository();
  const challenges =
    options?.challenges ?? createSupabaseWalletVerificationChallengeRepository();
  const completeVerification =
    options?.completeVerification ?? createSupabaseCompleteWalletVerification();
  const signatureVerifier =
    options?.signatureVerifier ?? createDefaultSignatureVerifier();
  const inventoryRepo =
    options?.inventory ?? createSupabaseWalletInventoryRepository();
  const providers =
    options?.providers ?? createDefaultInventoryProviderRegistry();

  const registration = createWalletRegistrationService({ profileWallets });
  const verification = createWalletVerificationService({
    profileWallets,
    challenges,
    completeVerification,
    signatureVerifier,
  });
  const inventory = createDefaultWalletInventoryService({
    profileWallets,
    inventory: inventoryRepo,
    providers,
  });

  return {
    registration,
    verification,
    inventory,
    profileWallets,
  };
}
