import { normalize, tokenize } from "./text";
import { isStore, type Store } from "./store";

export type { Store };

export interface ExternalOffer {
  storeCode: Store;
  titleRaw: string;
  normalizedTitle: string;
  priceValue: number;
  priceUnit: string;
  promo: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  sourceUrl?: string | null;
}

interface OpenApiParameter {
  in?: string;
  name?: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

interface SearchRequest {
  method: "GET" | "POST";
  path: string;
  queryParam?: string;
  storesParam?: string;
  bodyQueryField?: string;
  bodyStoresField?: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
const OPEN_API_DOC_PATHS = ["/v3/api-docs", "/api-docs"];
const HEALTH_PATHS = ["/actuator/health", "/health", "/swagger-ui.html", "/v3/api-docs"];
const PRODUCTS_ENDPOINT_PATH = "/products";
const QUERY_PARAM_CANDIDATES = ["query", "q", "search", "keyword", "term"];
const STORES_PARAM_CANDIDATES = ["stores", "storeCodes", "store", "chains", "markets"];

let cachedSearchRequest: SearchRequest | null | undefined;

interface ProductPayload {
  name?: string;
  quantity?: string;
  price?: number;
  oldPrice?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

interface ProductStorePayload {
  supermarket?: string;
  products?: ProductPayload[];
}

function getBaseUrl(): URL | null {
  const raw = process.env.SUPERMARKETS_API_BASE_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw.endsWith("/") ? raw : `${raw}/`);
  } catch {
    return null;
  }
}

async function fetchJSON<T>(url: URL, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function pickParameterName(
  parameters: OpenApiParameter[] | undefined,
  candidates: string[],
): string | undefined {
  if (!parameters) {
    return undefined;
  }

  const queryNames = parameters
    .filter((parameter) => parameter.in === "query" && parameter.name)
    .map((parameter) => parameter.name as string);

  return candidates.find((candidate) => queryNames.includes(candidate));
}

function findSearchRequestInDoc(doc: OpenApiDocument): SearchRequest | null {
  const paths = doc.paths ?? {};
  const strictCandidates: SearchRequest[] = [];
  const fallbackCandidates: SearchRequest[] = [];

  for (const [path, operations] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const normalizedMethod = method.toUpperCase();
      if (normalizedMethod !== "GET" && normalizedMethod !== "POST") {
        continue;
      }

      const haystack = [
        path,
        operation.operationId,
        operation.summary,
        operation.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes("search")) {
        continue;
      }

      const queryParam = pickParameterName(operation.parameters, QUERY_PARAM_CANDIDATES);
      const storesParam = pickParameterName(operation.parameters, STORES_PARAM_CANDIDATES);

      const candidate: SearchRequest =
        normalizedMethod === "GET"
          ? {
              method: "GET",
              path,
              queryParam,
              storesParam,
            }
          : {
              method: "POST",
              path,
              bodyQueryField: queryParam ?? "query",
              bodyStoresField: storesParam ?? "stores",
            };

      if (haystack.includes("offer") || haystack.includes("product")) {
        strictCandidates.push(candidate);
      } else {
        fallbackCandidates.push(candidate);
      }
    }
  }

  return strictCandidates[0] ?? fallbackCandidates[0] ?? null;
}

async function discoverSearchRequest(baseUrl: URL): Promise<SearchRequest | null> {
  for (const docPath of OPEN_API_DOC_PATHS) {
    try {
      const openApi = await fetchJSON<OpenApiDocument>(new URL(docPath, baseUrl));
      const request = findSearchRequestInDoc(openApi);
      if (request) {
        return request;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function getSearchRequest(baseUrl: URL): Promise<SearchRequest | null> {
  if (cachedSearchRequest !== undefined) {
    return cachedSearchRequest;
  }

  cachedSearchRequest = await discoverSearchRequest(baseUrl);
  return cachedSearchRequest;
}

async function executeSearch(
  baseUrl: URL,
  request: SearchRequest,
  query: string,
  stores: Store[],
): Promise<unknown> {
  if (request.method === "GET") {
    const url = new URL(request.path, baseUrl);
    url.searchParams.set(request.queryParam ?? "query", query);

    if (stores.length > 0 && request.storesParam) {
      url.searchParams.set(request.storesParam, stores.join(","));
    }

    return fetchJSON<unknown>(url);
  }

  const url = new URL(request.path, baseUrl);
  const payload: Record<string, unknown> = {
    [request.bodyQueryField ?? "query"]: query,
  };

  if (stores.length > 0) {
    payload[request.bodyStoresField ?? "stores"] = stores;
  }

  return fetchJSON<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function extractOfferCollection(payload: unknown, depth = 0): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["offers", "items", "products", "results", "data", "content"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  if (depth >= 2) {
    return [];
  }

  for (const value of Object.values(record)) {
    const nested = extractOfferCollection(value, depth + 1);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.\-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }

  return false;
}

function parseStoreCode(value: unknown): Store | null {
  const raw = asString(value)?.toLowerCase();
  if (!raw) {
    return null;
  }

  if (isStore(raw)) {
    return raw;
  }

  if (raw.includes("lidl")) {
    return "lidl";
  }
  if (raw.includes("kaufland")) {
    return "kaufland";
  }
  if (raw.includes("billa")) {
    return "billa";
  }

  return null;
}

function mapExternalOffer(payload: unknown, requestedStores: Store[]): ExternalOffer | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const resolvedStore =
    parseStoreCode(
      record.storeCode ??
        record.store ??
        record.supermarket ??
        record.retailer ??
        record.market ??
        record.chain,
    ) ?? (requestedStores.length === 1 ? requestedStores[0] : null);

  if (!resolvedStore) {
    return null;
  }

  if (!requestedStores.includes(resolvedStore)) {
    return null;
  }

  const title =
    asString(record.titleRaw) ??
    asString(record.title) ??
    asString(record.productName) ??
    asString(record.name);

  const priceValue =
    asNumber(record.priceValue) ??
    asNumber(record.price) ??
    asNumber(record.currentPrice) ??
    asNumber(record.promoPrice) ??
    asNumber(record.discountPrice);

  if (!title || priceValue === null) {
    return null;
  }

  const priceUnit = asString(record.priceUnit) ?? asString(record.unit) ?? "lv";

  return {
    storeCode: resolvedStore,
    titleRaw: title,
    normalizedTitle: normalize(title),
    priceValue,
    priceUnit,
    promo: asBoolean(record.promo ?? record.isPromo ?? record.promotional),
    validFrom: asString(record.validFrom),
    validTo: asString(record.validTo),
    sourceUrl: asString(record.sourceUrl ?? record.url ?? record.link),
  };
}

function dedupeOffers(offers: ExternalOffer[]): ExternalOffer[] {
  const deduped = new Map<string, ExternalOffer>();

  for (const offer of offers) {
    const key = `${offer.storeCode}::${offer.normalizedTitle}::${offer.priceValue.toFixed(2)}`;
    deduped.set(key, offer);
  }

  return Array.from(deduped.values());
}

function matchesQuery(productName: string, normalizedQuery: string): boolean {
  const normalizedTitle = normalize(productName);
  if (!normalizedTitle) {
    return false;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenize(normalizedQuery);
  const titleTokens = new Set(tokenize(normalizedTitle));

  return queryTokens.some((token) => titleTokens.has(token));
}

function mapProductsEndpointPayload(
  payload: unknown,
  requestedStores: Store[],
  normalizedQuery: string,
): ExternalOffer[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const offers: ExternalOffer[] = [];

  for (const storeRow of payload as ProductStorePayload[]) {
    const storeCode = parseStoreCode(storeRow.supermarket);
    if (!storeCode || !requestedStores.includes(storeCode)) {
      continue;
    }

    for (const product of storeRow.products ?? []) {
      const titleRaw = asString(product.name);
      const priceValue = asNumber(product.price);

      if (!titleRaw || priceValue === null) {
        continue;
      }

      if (!matchesQuery(titleRaw, normalizedQuery)) {
        continue;
      }

      const oldPriceValue = asNumber(product.oldPrice ?? null);

      offers.push({
        storeCode,
        titleRaw,
        normalizedTitle: normalize(titleRaw),
        priceValue,
        priceUnit: asString(product.quantity) ?? "lv",
        promo: oldPriceValue !== null ? oldPriceValue > priceValue : true,
        validFrom: asString(product.validFrom),
        validTo: asString(product.validUntil),
        sourceUrl: null,
      });
    }
  }

  return offers;
}

async function fetchFromProductsEndpoint(
  baseUrl: URL,
  normalizedQuery: string,
  requestedStores: Store[],
  offersOnly: boolean,
): Promise<ExternalOffer[]> {
  if (requestedStores.length === 0) {
    return [];
  }

  const url = new URL(PRODUCTS_ENDPOINT_PATH, baseUrl);
  url.searchParams.set("offers", offersOnly ? "true" : "false");

  for (const store of requestedStores) {
    url.searchParams.append("supermarket", store);
  }

  const payload = await fetchJSON<unknown>(url);
  return mapProductsEndpointPayload(payload, requestedStores, normalizedQuery);
}

export async function searchOffers(query: string, stores: Store[]): Promise<ExternalOffer[]> {
  const normalizedQuery = query.trim();
  const baseUrl = getBaseUrl();

  if (!baseUrl || !normalizedQuery) {
    return [];
  }

  const requestedStores = stores.length > 0 ? stores : (["lidl", "kaufland", "billa"] as Store[]);

  try {
    const request = await getSearchRequest(baseUrl);
    const collected: ExternalOffer[] = [];

    if (request) {
      const payload = await executeSearch(baseUrl, request, normalizedQuery, requestedStores);
      const collection = extractOfferCollection(payload);

      for (const item of collection) {
        const offer = mapExternalOffer(item, requestedStores);
        if (!offer) {
          continue;
        }

        collected.push(offer);
      }
    }

    // Swagger-verified strategy for sofia-supermarkets-api:
    // 1) try promo-only offers first
    // 2) fallback to all offers only for stores that returned no promo results
    // TODO: lock this mapping fully once API contract is frozen in upstream project.
    const promoOffers = await fetchFromProductsEndpoint(
      baseUrl,
      normalizedQuery,
      requestedStores,
      true,
    );
    collected.push(...promoOffers);

    const storesWithPromoMatches = new Set(promoOffers.map((offer) => offer.storeCode));
    const storesWithoutPromoMatches = requestedStores.filter(
      (store) => !storesWithPromoMatches.has(store),
    );

    if (storesWithoutPromoMatches.length > 0) {
      const fallbackOffers = await fetchFromProductsEndpoint(
        baseUrl,
        normalizedQuery,
        storesWithoutPromoMatches,
        false,
      );
      collected.push(...fallbackOffers);
    }

    return dedupeOffers(collected);
  } catch {
    return [];
  }
}

export async function healthCheck(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return false;
  }

  for (const path of HEALTH_PATHS) {
    try {
      const response = await fetch(new URL(path, baseUrl), { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
