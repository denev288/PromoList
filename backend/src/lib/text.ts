const BG_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "",
  ю: "yu",
  я: "ya",
};

function transliterateBgToLatin(value: string): string {
  return value
    .split("")
    .map((char) => BG_TO_LATIN[char] ?? char)
    .join("");
}

export function normalize(value: string): string {
  const lowered = value.toLowerCase().trim();
  if (!lowered) {
    return "";
  }

  // TODO: extend transliteration rules for latin->bg edge cases and abbreviations.
  const transliterated = transliterateBgToLatin(lowered);

  return transliterated
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(normalized.split(" ").filter((token) => token.length >= 2)),
  );
}
