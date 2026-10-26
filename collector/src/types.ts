/** Um anúncio lido da Biblioteca de Anúncios da Meta. */
export interface MetaAd {
  libraryId: string;
  advertiser: string;
  domain: string | null;
  body: string;
  startDate: string | null; // ISO yyyy-mm-dd
  copies: number;           // "X anúncios usam esse criativo e esse texto"
}

/** Resultado de uma busca por palavra-chave. */
export interface KeywordResult {
  keyword: string;
  totalResults: string | null; // ex.: "~6.900 resultados"
  ads: MetaAd[];
}

/**
 * Fonte de anúncios da Meta. Hoje é o robô próprio (navegador);
 * depois basta criar outra implementação (Apify, SearchAPI...) com a mesma assinatura.
 */
export interface MetaAdSource {
  name: string;
  searchKeyword(term: string): Promise<KeywordResult>;
  close(): Promise<void>;
}

export interface GoogleAdSource {
  name: string;
  countAdsForDomain(domain: string): Promise<number | null>;
  close(): Promise<void>;
}

export interface RaCompany {
  position: number;
  name: string;
  reputation: string | null;
  complaints: number;
  slug: string | null;
}

export interface OfferSnapshot {
  offerKey: string;
  advertiser: string;
  advertisers: string[];
  domain: string | null;
  cards: number;
  copies: number;
  pages: number;
  oldestStart: string | null;
  keywords: string[];
  sampleText: string;
}
