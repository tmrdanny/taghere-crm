// 프리미엄 카카오톡 공용 샘플 이미지 — apps/api/assets/premium-stock (scripts/generate-premium-stock.cjs 로 생성)
// 편집 화면에서는 imageId 를 “stock:{key}” 로 두고, 실제 발송 때만 솔라피에 올린다.
// 이미지·슬롯별로 한 번 올린 파일 ID 는 DB 에 캐시해 다시 올리지 않는다.
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma.js';
import { uploadBmsImage } from './solapi-bms.js';
import { BubbleType, ImageSlot, PkContent, PkImage } from './spec.js';

export const STOCK_DIR = path.join(process.cwd(), 'assets', 'premium-stock');
const STOCK_PREFIX = 'stock:';

const SUFFIX: Record<ImageSlot, string> = {
  BMS: 'w',
  BMS_WIDE: 'wide',
  BMS_WIDE_MAIN_ITEM_LIST: 'w',
  BMS_WIDE_SUB_ITEM_LIST: 'sq',
  BMS_CAROUSEL_FEED_LIST: 'w',
  BMS_CAROUSEL_COMMERCE_LIST: 'w',
};

async function stockFileId(key: string, slot: ImageSlot): Promise<string> {
  if (!/^[a-z0-9-]{1,40}$/.test(key)) throw new Error('샘플 이미지를 찾을 수 없습니다.');
  const cached = await prisma.premiumStockImage.findUnique({ where: { key_slot: { key, slot } } });
  if (cached) return cached.fileId;
  const file = path.join(STOCK_DIR, `${key}-${SUFFIX[slot]}.jpg`);
  if (!fs.existsSync(file)) throw new Error('샘플 이미지를 찾을 수 없습니다.');
  const fileId = await uploadBmsImage(file, slot);
  await prisma.premiumStockImage.upsert({ where: { key_slot: { key, slot } }, update: { fileId }, create: { key, slot, fileId } });
  return fileId;
}

async function resolve(img: PkImage | null, slot: ImageSlot): Promise<PkImage | null> {
  if (!img || !img.imageId.startsWith(STOCK_PREFIX)) return img;
  return { ...img, imageId: await stockFileId(img.imageId.slice(STOCK_PREFIX.length), slot) };
}

/** 편집 내용 속 샘플 이미지(stock:*)를 솔라피 파일 ID 로 바꾼다 — 형태별 슬롯 규격대로 */
export async function resolveStockImages(type: BubbleType, c: PkContent): Promise<PkContent> {
  const mainSlot: ImageSlot = type === 'WIDE' ? 'BMS_WIDE' : 'BMS';
  const cardSlot: ImageSlot = type === 'CAROUSEL_COMMERCE' ? 'BMS_CAROUSEL_COMMERCE_LIST' : 'BMS_CAROUSEL_FEED_LIST';
  return {
    ...c,
    image: await resolve(c.image, mainSlot),
    mainItem: { ...c.mainItem, image: await resolve(c.mainItem.image, 'BMS_WIDE_MAIN_ITEM_LIST') },
    subItems: await Promise.all(c.subItems.map(async (it) => ({ ...it, image: await resolve(it.image, 'BMS_WIDE_SUB_ITEM_LIST') }))),
    cards: await Promise.all(c.cards.map(async (card) => ({ ...card, image: await resolve(card.image, cardSlot) }))),
  };
}
