import { nftDataService } from "@/lib/providers/service";

export async function searchCollections(query: string) {
  return nftDataService.searchCollections(query);
}

export async function getCollectionEvaluation(slug: string) {
  return nftDataService.getCollectionEvaluation(slug);
}

export async function getTrendingCollections() {
  return nftDataService.getTrendingCollections();
}

export async function getWalletPortfolio(walletAddress: string) {
  return nftDataService.getWalletPortfolio(walletAddress);
}

export async function getCollectionEvents(slug: string) {
  return nftDataService.getCollectionSales(slug);
}

export async function getCollectionListings(slug: string) {
  return nftDataService.getCollectionListings(slug);
}

export async function getCollectionTopOffers(slug: string) {
  return nftDataService.getCollectionOffers(slug);
}
