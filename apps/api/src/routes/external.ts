import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware } from '../middleware/webhook-auth.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import { parseKoreanAddress } from '../utils/address-parser.js';
import { notifyCrmOn } from '../services/taghere-api.js';
import { pushCrmStateToV2 } from '../services/crm-state-push.js';
import { V1_STORE_ID_RE, V2_STORE_ID_RE } from '../services/store-ref.js';

const VALID_STORE_CATEGORIES = [
  'KOREAN', 'CHINESE', 'JAPANESE', 'WESTERN', 'ASIAN', 'BUNSIK', 'FASTFOOD',
  'MEAT', 'SEAFOOD', 'BUFFET', 'BRUNCH', 'CAFE', 'BAKERY', 'DESSERT',
  'ICECREAM', 'BEER', 'IZAKAYA', 'WINE_BAR', 'COCKTAIL_BAR', 'POCHA',
  'KOREAN_PUB', 'COOK_PUB', 'FOODCOURT', 'OTHER',
];

const isValidStoreCategory = (value: string | null | undefined): boolean => {
  return !!value && VALID_STORE_CATEGORIES.includes(value);
};

const router = Router();

// POST /api/external/register - 외부 등록 API
router.post('/register', webhookAuthMiddleware, async (req, res) => {
  try {
    const { email, storeName, ownerName, phone, category, businessRegNumber, address, source } = req.body;

    // 필수 필드 검증
    if (!email || !storeName || !ownerName || !phone || !source) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: '필수 필드를 입력해주세요. (email, storeName, ownerName, phone, source)',
      });
    }

    if (source !== 'v1' && source !== 'v2') {
      return res.status(400).json({
        success: false,
        error: 'Invalid source',
        message: 'source는 "v1" 또는 "v2"만 허용됩니다.',
      });
    }

    const rawStoreId: string = typeof req.body.storeId === 'string' ? req.body.storeId.trim() : '';
    const expectedIdRe = source === 'v2' ? V2_STORE_ID_RE : V1_STORE_ID_RE;
    // 형식 불일치는 저장하지 않되 등록 자체는 계속한다 (CRM 계정 생성이 storeId 오류에 볼모잡히지 않게)
    const externalStoreId: string | null = rawStoreId && expectedIdRe.test(rawStoreId) ? rawStoreId : null;
    if (rawStoreId && !externalStoreId) {
      console.warn(`[External] storeId 형식 불일치로 링크 저장 생략 - source=${source}, storeId=${rawStoreId.slice(0, 40)}`);
    }

    const linkColumn = source === 'v2' ? 'v2StoreId' : 'v1StoreId';

    // 이메일 중복 체크
    const existingUser = await prisma.staffUser.findUnique({
      where: { email },
      include: { store: true },
    });

    if (existingUser) {
      // 기존 매장에 주문 서비스 ID 백필 (비어 있을 때만 — 이미 다른 값이면 중복 CRM 매장 신호이므로 경고만)
      if (externalStoreId && existingUser.store) {
        const currentLinkId = (existingUser.store as any)[linkColumn] as string | null;
        if (!currentLinkId) {
          const holder = await prisma.store.findFirst({
            where: { [linkColumn]: externalStoreId },
            select: { id: true, name: true },
          });
          if (!holder) {
            await prisma.store.update({
              where: { id: existingUser.storeId },
              // taghereVersion 은 링크 컬럼의 파생값 — v2 링크가 생기면 v2 로 동기화
              data: {
                [linkColumn]: externalStoreId,
                ...(linkColumn === 'v2StoreId' ? { taghereVersion: 'v2' } : {}),
              },
            });
            console.log(`[External] ${linkColumn} backfilled on exists - storeId=${existingUser.storeId}, ${linkColumn}=${externalStoreId}`);
          } else {
            console.warn(`[External] ${linkColumn}=${externalStoreId} 는 이미 다른 CRM 매장(${holder.id} ${holder.name})에 연결됨 — 중복 CRM 매장 의심, 수동 확인 필요`);
          }
        } else if (currentLinkId !== externalStoreId) {
          console.warn(`[External] ${linkColumn} 불일치 - CRM 매장 ${existingUser.storeId} 기존=${currentLinkId}, 요청=${externalStoreId} — 수동 확인 필요`);
        }
      }
      // 기존 매장도 V2 에 상태를 재발송한다 — 종전엔 exists 조기 반환이 활성화 통보를 건너뛰어
      // "CRM 은 켜져 있는데 V2 는 꺼진" 비대칭의 주 원인이었다. (v2StoreId 미연결이면 내부에서 skip)
      if (source === 'v2') {
        const push = await pushCrmStateToV2(existingUser.storeId);
        console.log(`[External] exists 상태 재발송 - storeId=${existingUser.storeId}, pushed=${push.pushed}${push.pushed ? '' : `, reason=${push.reason}`}`);
      }
      console.log(`[External] Register skipped (exists) - source=${source}, email=${email}, storeId=${existingUser.storeId}`);
      return res.status(200).json({
        result: 'exists',
        storeId: existingUser.storeId,
        staffUserId: existingUser.id,
        slug: existingUser.store?.slug || null,
      });
    }

    // 주문 서비스 매장 ID 매칭 — 같은 storeId 매장이 이미 있으면 새로 만들지 않는다 (멱등).
    // 오너 이메일이 바뀐 재호출·중복 CRM 매장 생성(에이직피자형)을 구조적으로 차단한다.
    if (externalStoreId) {
      const linkedStore = await prisma.store.findFirst({
        where: { [linkColumn]: externalStoreId },
        select: {
          id: true,
          slug: true,
          staffUsers: { where: { role: 'OWNER' }, select: { id: true }, take: 1 },
        },
      });
      if (linkedStore) {
        if (source === 'v2') {
          const push = await pushCrmStateToV2(linkedStore.id);
          console.log(`[External] linked-store 상태 재발송 - storeId=${linkedStore.id}, pushed=${push.pushed}${push.pushed ? '' : `, reason=${push.reason}`}`);
        }
        console.log(`[External] Register skipped (linked) - source=${source}, ${linkColumn}=${externalStoreId}, storeId=${linkedStore.id}`);
        return res.status(200).json({
          result: 'exists',
          storeId: linkedStore.id,
          staffUserId: linkedStore.staffUsers[0]?.id ?? null,
          slug: linkedStore.slug || null,
        });
      }
    }

    // 사업자등록번호 중복 체크 (있는 경우만)
    if (businessRegNumber) {
      const existingStore = await prisma.store.findFirst({
        where: { businessRegNumber },
      });

      if (existingStore) {
        return res.status(400).json({
          success: false,
          error: 'Duplicate businessRegNumber',
          message: '이미 등록된 사업자등록번호입니다.',
        });
      }
    }

    // 비밀번호 해시 (기본 비밀번호)
    const passwordHash = await bcrypt.hash('123456789a', 10);

    // slug 생성
    const baseSlug = generateSlug(storeName);
    const slug = await getUniqueSlug(baseSlug);

    // 주소 자동 정규화
    const parsedAddress = address ? parseKoreanAddress(address) : null;

    // 트랜잭션으로 Store, Wallet, WaitingSetting, WaitingType, StaffUser 동시 생성
    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: storeName,
          slug,
          ownerName,
          phone,
          category: isValidStoreCategory(category) ? category : null,
          businessRegNumber: businessRegNumber || null,
          address: address || null,
          addressSido: parsedAddress?.sido || null,
          addressSigungu: parsedAddress?.sigungu || null,
          addressDetail: parsedAddress?.detail || null,
          enrollmentMode: 'MEMBERSHIP',
          taghereVersion: source,
          // 주문 서비스 매장 ID 매핑 — 이후 모든 시스템 간 통신의 식별자
          ...(externalStoreId ? { [linkColumn]: externalStoreId } : {}),
        },
      });

      await tx.wallet.create({
        data: {
          storeId: store.id,
          balance: 500,
        },
      });

      // 스탬프 설정 행을 미리 만들어 QR 입구 secret(스키마 기본값)을 즉시 발급한다.
      // enabled=false 라 스탬프가 켜지지는 않는다 — 어드민에서 QR 링크만 바로 뽑을 수 있게 하는 목적.
      await tx.stampSetting.create({
        data: { storeId: store.id },
      });

      await tx.waitingSetting.create({
        data: {
          storeId: store.id,
          operationStatus: 'ACCEPTING',
        },
      });

      await tx.waitingType.create({
        data: {
          storeId: store.id,
          name: '홀',
          avgWaitTimePerTeam: 5,
          sortOrder: 0,
          isActive: true,
        },
      });

      // 테이블 채팅 기본 활성화
      await tx.chatSetting.create({
        data: {
          storeId: store.id,
          enabled: true,
        },
      });

      const user = await tx.staffUser.create({
        data: {
          storeId: store.id,
          email,
          passwordHash,
          name: ownerName,
          role: 'OWNER',
        },
      });

      return { storeId: store.id, staffUserId: user.id, slug: store.slug };
    });

    // V2 등록 시 자동으로 CRM 활성화 — 전체 상태 push (V2 state 엔드포인트 미배포 시 레거시 crm/on 폴백)
    if (source === 'v2' && result.slug) {
      try {
        const push = externalStoreId ? await pushCrmStateToV2(result.storeId) : { pushed: false, reason: 'no_store_id' as const };
        if (!push.pushed) {
          await notifyCrmOn({
            version: 'v2',
            storeName,
            v2StoreId: externalStoreId,
            slug: result.slug,
            isStampMode: false,
            enrollmentMode: 'MEMBERSHIP',
          });
        }
        console.log(`[External] CRM 활성화 통보 - storeName=${storeName}, slug=${result.slug}, via=${push.pushed ? 'state-push' : 'legacy-crm-on'}`);
      } catch (err: any) {
        console.error(`[External] CRM 활성화 통보 실패 - storeName=${storeName}:`, err.message);
      }
    }

    console.log(`[External] Register created - source=${source}, email=${email}, storeId=${result.storeId}, staffUserId=${result.staffUserId}`);

    res.status(201).json({
      result: 'created',
      storeId: result.storeId,
      staffUserId: result.staffUserId,
      slug: result.slug,
    });
  } catch (error) {
    console.error('[External] Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: '외부 등록 중 오류가 발생했습니다.',
    });
  }
});

export default router;
