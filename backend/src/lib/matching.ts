import { tokenize } from "./text";

export type ItemType = "generic" | "preferred";

export interface MatchableItem {
  name: string;
  type: ItemType;
  preferredQuery: string | null;
}

export interface MatchableOffer {
  titleRaw: string;
  normalizedTitle: string;
}

export interface MatchResult {
  score: number;
  reason: string;
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

function intersectionCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = intersectionCount(left, right);
  const union = left.size + right.size - intersection;
  if (union === 0) {
    return 0;
  }

  return intersection / union;
}

function scoreGeneric(item: MatchableItem, offerTokens: Set<string>): MatchResult {
  const keywords = tokenSet(item.name);
  if (keywords.size === 0 || offerTokens.size === 0) {
    return { score: 0, reason: "no-match" };
  }

  const overlap = intersectionCount(keywords, offerTokens);
  if (overlap === 0) {
    return { score: 0, reason: "no-match" };
  }

  const overlapRatio = overlap / keywords.size;
  const score = Math.min(1, 0.35 + overlapRatio * 0.65);

  return {
    score,
    reason: overlap > 1 ? `keyword-match:${overlap}` : "keyword-match",
  };
}

function scorePreferred(item: MatchableItem, offerTokens: Set<string>): MatchResult {
  const targetQuery = item.preferredQuery?.trim() || item.name;
  const targetTokens = tokenSet(targetQuery);
  if (targetTokens.size === 0 || offerTokens.size === 0) {
    return { score: 0, reason: "no-match" };
  }

  const overlapScore = jaccard(targetTokens, offerTokens);
  const preferredTokens = item.preferredQuery ? tokenSet(item.preferredQuery) : new Set<string>();
  const brandHit = preferredTokens.size > 0 && intersectionCount(preferredTokens, offerTokens) > 0;
  const brandBonus = brandHit ? 0.2 : 0;

  const score = Math.min(1, overlapScore + brandBonus);
  const reasons = [`token-overlap:${overlapScore.toFixed(2)}`];

  if (brandHit) {
    reasons.push("brand-match");
  }

  return {
    score,
    reason: reasons.join(", "),
  };
}

export function scoreOfferForItem(item: MatchableItem, offer: MatchableOffer): MatchResult {
  const offerTokens = tokenSet(offer.normalizedTitle || offer.titleRaw);

  if (item.type === "preferred") {
    return scorePreferred(item, offerTokens);
  }

  return scoreGeneric(item, offerTokens);
}
