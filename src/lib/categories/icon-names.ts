// Ícones lucide que podem ser escolhidos para uma categoria (lista curada para não
// carregar o lucide inteiro no navegador). Inclui todos os usados por
// seed_default_categories() na migration 0002. O mapa nome → componente fica em
// src/components/category-icon.tsx.
export const CATEGORY_ICON_NAMES = [
  "shopping-cart",
  "utensils",
  "coffee",
  "beer",
  "house",
  "plug-zap",
  "zap",
  "droplet",
  "wifi",
  "smartphone",
  "tv",
  "bus",
  "car",
  "fuel",
  "plane",
  "heart-pulse",
  "stethoscope",
  "pill",
  "dumbbell",
  "graduation-cap",
  "book-open",
  "baby",
  "paw-print",
  "party-popper",
  "music",
  "gamepad-2",
  "repeat",
  "shirt",
  "scissors",
  "sparkles",
  "gift",
  "store",
  "wrench",
  "landmark",
  "receipt",
  "tag",
  "circle-ellipsis",
  "briefcase",
  "laptop",
  "trending-up",
  "hand-coins",
  "piggy-bank",
  "banknote",
  "wallet",
  "undo-2",
  "circle-plus",
  "arrow-left-right",
] as const;

export type CategoryIconName = (typeof CATEGORY_ICON_NAMES)[number];

export function isCategoryIconName(value: unknown): value is CategoryIconName {
  return typeof value === "string" && (CATEGORY_ICON_NAMES as readonly string[]).includes(value);
}
