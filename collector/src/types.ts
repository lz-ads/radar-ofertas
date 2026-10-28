export type DestType = "site" | "whatsapp" | "instagram" | "formulario" | "mensagem" | "app" | "ligacao";

/** Um anúncio lido da Biblioteca de Anúncios da Meta. */
export interface MetaAd {
  libraryId: string;
  advertiser: string;
  domain: string | null;
  body: string;
  startDate: string | null; // ISO yyyy-mm-dd
  copies: number;           // "X anúncios usam esse criativo e esse texto"
  cta?: string | null;        // botão do anúncio ("Saiba mais", "Enviar mensagem"...)
  destType?: DestType | null; // para onde o anúncio leva
  pageUrl?: string | null;    // página do anunciante no Facebook
  landingUrl?: string | null; // página de destino (vendas), sem parâmetros de rastreio
  thumbUrl?: string | null;   // imagem do criativo (ou capa do vídeo)
  mediaType?: "image" | "video" | null;
  videoUrl?: string | null;   // arquivo do vídeo (link do Facebook, expira em poucos dias)
}

/** Links e mídia lidos do HTML de cada card, por ID da biblioteca. */
export interface AdLinks {
  pageUrl: string | null;
  landingUrl: string | null;
  thumbUrl: string | null;
  mediaType: "image" | "video" | null;
}

/** Resultado de uma busca por palavra-chave. */
export interface KeywordResult {
  keyword: string;
  totalResults: string | null; // ex.: "~6.900 resultados"
  ads: MetaAd[];
  /** Diagnóstico da rolagem: cards no início, no fim, rodadas e o fim do texto da página. */
  scroll?: { start: number; end: number; rounds: number; tail: string };
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
  landingUrl: string | null;
  pageUrl: string | null;
  thumbUrl: string | null;
  destType: DestType | null;
}
