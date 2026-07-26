import type { ProfileWalletRole } from "@/lib/profile-wallets/domain";
import {
  normalizeWalletAddressOrThrow,
  ProfileWalletNormalizationError,
} from "@/lib/profile-wallets/normalization";
import {
  ProfileWalletOwnershipConflictError,
  type ProfileWalletRepository,
} from "@/lib/profile-wallets/repository";
import {
  resolveTrustedProfileId,
  type AuthenticatedProfileContext,
} from "@/lib/wallet-verification/auth-context";
import {
  WalletRegistrationDisconnectedError,
  WalletRegistrationOwnershipConflictError,
  WalletRegistrationRevokedError,
  WalletRegistrationError,
  type RegisterWalletRequest,
  type RegisterWalletResult,
} from "@/lib/wallet-registration/domain";

export interface WalletRegistrationService {
  /**
   * Create or reuse a profile_wallets record for the authenticated profile.
   *
   * - profileId always comes from trusted auth
   * - address is normalized before persistence / lookup
   * - registration never marks the wallet verified
   * - existing role is preserved on reuse
   */
  registerWallet(
    auth: AuthenticatedProfileContext,
    request: RegisterWalletRequest
  ): Promise<RegisterWalletResult>;
}

export interface CreateWalletRegistrationServiceOptions {
  profileWallets: ProfileWalletRepository;
}

export function createWalletRegistrationService(
  options: CreateWalletRegistrationServiceOptions
): WalletRegistrationService {
  return {
    async registerWallet(
      auth: AuthenticatedProfileContext,
      request: RegisterWalletRequest
    ): Promise<RegisterWalletResult> {
      const profileId = resolveTrustedProfileId({ auth });

      let chainNamespace: RegisterWalletRequest["chainNamespace"];
      let normalizedAddress: string;
      try {
        const normalized = normalizeWalletAddressOrThrow(
          request.chainNamespace,
          request.address
        );
        chainNamespace = normalized.chainNamespace;
        normalizedAddress = normalized.normalizedAddress;
      } catch (cause) {
        if (cause instanceof ProfileWalletNormalizationError) {
          throw new WalletRegistrationError(
            cause.message.includes("namespace")
              ? "unsupported_namespace"
              : "invalid_address",
            cause.message
          );
        }
        throw cause;
      }

      const existing = await options.profileWallets.findWalletByChainAndAddress(
        chainNamespace,
        normalizedAddress
      );

      if (existing) {
        if (existing.profileId !== profileId) {
          throw new WalletRegistrationOwnershipConflictError(
            `Wallet ${chainNamespace}:${normalizedAddress} is already owned by another profile.`
          );
        }

        if (existing.verificationStatus === "revoked") {
          throw new WalletRegistrationRevokedError(
            `Wallet ${existing.id} is revoked and cannot be re-registered silently.`
          );
        }

        if (existing.disconnectedAt != null) {
          throw new WalletRegistrationDisconnectedError(
            `Wallet ${existing.id} is disconnected and cannot be reactivated silently.`
          );
        }

        // Idempotent reuse for the same authenticated profile.
        // Preserve role and pending/verified status — never upgrade to verified here.
        return { wallet: existing, created: false };
      }

      const role: ProfileWalletRole = request.role ?? "connected";

      try {
        const wallet = await options.profileWallets.createWallet({
          profileId,
          chainNamespace,
          address: request.address.trim(),
          role,
          verificationStatus: "pending",
          verifiedAt: null,
        });
        return { wallet, created: true };
      } catch (cause) {
        if (cause instanceof ProfileWalletOwnershipConflictError) {
          // Race: another profile claimed the identity between find and create.
          throw new WalletRegistrationOwnershipConflictError(cause.message);
        }
        throw cause;
      }
    },
  };
}
