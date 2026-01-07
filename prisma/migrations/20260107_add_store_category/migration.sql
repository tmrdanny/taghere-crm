-- CreateEnum: StoreCategory
CREATE TYPE "StoreCategory" AS ENUM (
  'KOREAN',
  'CHINESE',
  'JAPANESE',
  'WESTERN',
  'ASIAN',
  'BUNSIK',
  'FASTFOOD',
  'MEAT',
  'SEAFOOD',
  'BUFFET',
  'BRUNCH',
  'CAFE',
  'BAKERY',
  'DESSERT',
  'ICECREAM',
  'BEER',
  'IZAKAYA',
  'WINE_BAR',
  'COCKTAIL_BAR',
  'POCHA',
  'KOREAN_PUB',
  'FOODCOURT',
  'OTHER'
);

-- AlterTable: Add category column to stores
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "category" "StoreCategory";
