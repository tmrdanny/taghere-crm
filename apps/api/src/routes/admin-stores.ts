import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { parseKoreanAddress } from '../utils/address-parser.js';
import { geocodeAddress } from '../services/geocode.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import {
  notifyCrmOn,
  notifyCrmOff,
  notifyStoreMetacitySettingsToV2,
  discoverMetacityStoreIdxFromV2,
} from '../services/taghere-api.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// enrollmentMode 가 STAMP 인 매장은 스탬프 적립 기능이 자동으로 켜져 있어야 한다.
// StampSetting 이 없으면 생성(enabled=true), 있으면 enabled=true 로 올린다.
// 트랜잭션 클라이언트(tx) 또는 prisma 둘 다 전달 가능.
async function ensureStampEnabled(client: Prisma.TransactionClient, storeId: string) {
  await client.stampSetting.upsert({
    where: { storeId },
    create: { storeId, enabled: true, alimtalkEnabled: true },
    update: { enabled: true },
  });
}

// GET /api/admin/stores - 모든 매장 목록 조회
router.get('/stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 서버 페이지네이션 + 전 매장 검색/필터 (page/pageSize/search/category/sort)
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    // pageSize 상한을 크게 둠 — 엑셀 내보내기는 큰 pageSize로 전체 매칭을 받는다
    const pageSize = Math.min(Math.max(1, parseInt((req.query.pageSize as string) || '30', 10) || 30), 100000);
    const search = ((req.query.search as string) || '').trim();
    const category = ((req.query.category as string) || '').trim();
    const sort = (req.query.sort as string) || 'createdAt';

    const where: Prisma.StoreWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { ownerName: { contains: search, mode: 'insensitive' } },
        { businessRegNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category as Prisma.StoreWhereInput['category'];

    const orderBy: Prisma.StoreOrderByWithRelationInput =
      sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' };

    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 총 개수 + 현재 페이지(스칼라+wallet만, 매장당 서브쿼리 없음)
    const [total, stores] = await Promise.all([
      prisma.store.count({ where }),
      prisma.store.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          category: true,
          slug: true,
          ownerName: true,
          phone: true,
          businessRegNumber: true,
          address: true,
          createdAt: true,
          pointRatePercent: true,
          pointUsageRule: true,
          pointsAlimtalkEnabled: true,
          crmEnabled: true,
          enrollmentMode: true,
          taghereVersion: true,
          metacityEnabled: true,
          metacityBrandCode: true,
          metacityStoreIdx: true,
          metacityAccessCode: true,
          metacityMembershipType: true,
          yahwaEnabled: true,
          latitude: true,
          longitude: true,
          wallet: { select: { balance: true } },
          stampSetting: { select: { scanEntrySecret: true, locationGuardEnabled: true, locationGuardRadiusM: true } },
        },
      }),
    ]);

    // 페이지의 storeId들만 배치 보강 (상관 서브쿼리 1,022회 → 묶음 쿼리)
    const ids = stores.map((s) => s.id);
    const [owners, counts, monthlyCredits] = await Promise.all([
      prisma.staffUser.findMany({
        where: { storeId: { in: ids }, role: 'OWNER' },
        select: { id: true, email: true, storeId: true },
      }),
      // 페이지가 사실상 전체(대량 pageSize=fetch-all)면 IN(수천) 필터보다 전체 groupBy가 빠름
      prisma.customer.groupBy({
        by: ['storeId'],
        where: ids.length > 200 ? undefined : { storeId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.monthlyCredit.findMany({
        where: { storeId: { in: ids }, yearMonth: currentYearMonth },
        select: { storeId: true, totalCredits: true, usedCredits: true },
      }),
    ]);
    const ownerMap = new Map(owners.map((o) => [o.storeId, o]));
    const countMap = new Map(counts.map((c) => [c.storeId, c._count._all]));
    const creditMap = new Map(monthlyCredits.map((c) => [c.storeId, c]));

    const formattedStores = stores.map((store) => {
      const credit = creditMap.get(store.id);
      const totalCredits = credit?.totalCredits ?? 30;
      const usedCredits = credit?.usedCredits ?? 0;
      const owner = ownerMap.get(store.id);
      return {
        id: store.id,
        name: store.name,
        category: store.category,
        slug: store.slug,
        ownerName: store.ownerName,
        phone: store.phone,
        businessRegNumber: store.businessRegNumber,
        address: store.address,
        createdAt: store.createdAt,
        ownerEmail: owner?.email || null,
        ownerId: owner?.id || null,
        customerCount: countMap.get(store.id) ?? 0,
        // Point settings
        pointRatePercent: store.pointRatePercent,
        pointUsageRule: store.pointUsageRule,
        pointsAlimtalkEnabled: store.pointsAlimtalkEnabled,
        crmEnabled: (store as any).crmEnabled ?? true,
        enrollmentMode: (store as any).enrollmentMode ?? 'POINTS',
        taghereVersion: (store as any).taghereVersion ?? 'v1',
        // 메타씨티 POS 연동 설정 (UI 토글 상태 유지에 필수)
        metacityEnabled: (store as any).metacityEnabled ?? false,
        metacityBrandCode: (store as any).metacityBrandCode ?? null,
        metacityStoreIdx: (store as any).metacityStoreIdx ?? null,
        metacityAccessCode: (store as any).metacityAccessCode ?? null,
        metacityMembershipType: (store as any).metacityMembershipType ?? 'INTEGRATED',
        // 야화 연동(웨이팅·성별통계·포인트 동기화) — /api/v1 노출 여부
        yahwaEnabled: (store as any).yahwaEnabled ?? false,
        // 스탬프 링크 비밀 입구 secret (QR shortURL 목적지 구성용)
        scanEntrySecret: (store as any).stampSetting?.scanEntrySecret ?? null,
        // 위치 기반 적립 확인 (매장별 토글, 기본 OFF)
        locationGuardEnabled: (store as any).stampSetting?.locationGuardEnabled ?? false,
        locationGuardRadiusM: (store as any).stampSetting?.locationGuardRadiusM ?? 200,
        latitude: (store as any).latitude ?? null,
        longitude: (store as any).longitude ?? null,
        walletBalance: store.wallet?.balance || 0,
        monthlyCredit: {
          total: totalCredits,
          used: usedCredits,
          remaining: Math.max(0, totalCredits - usedCredits),
        },
      };
    });

    res.json({ stores: formattedStores, total, page, pageSize });
  } catch (error) {
    console.error('Admin stores error:', error);
    res.status(500).json({ error: '매장 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/stores/options - 경량 매장 피커(전체, 보강 없음 — 빠름)
router.get('/stores/options', adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      select: { id: true, name: true, slug: true, ownerName: true },
      orderBy: { name: 'asc' },
    });
    res.json(stores);
  } catch (error) {
    console.error('Admin store options error:', error);
    res.status(500).json({ error: '매장 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/reset-password - 매장 점주 비밀번호 초기화
router.post('/stores/:storeId/reset-password', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const defaultPassword = '123456789a';

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        staffUsers: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const owner = store.staffUsers[0];

    if (!owner) {
      return res.status(404).json({ error: '매장 점주를 찾을 수 없습니다.' });
    }

    // 비밀번호 해시
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // 비밀번호 업데이트
    await prisma.staffUser.update({
      where: { id: owner.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: `${store.name} 매장의 비밀번호가 초기화되었습니다.`,
      ownerEmail: owner.email,
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: '비밀번호 초기화 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/admin/stores/:storeId - 매장 정보 수정
router.patch('/stores/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const {
      name,
      category,
      slug,
      ownerName,
      phone,
      businessRegNumber,
      address,
      pointRatePercent,
      pointUsageRule,
      pointsAlimtalkEnabled,
      crmEnabled,
      enrollmentMode,
      taghereVersion,
      metacityEnabled,
      metacityBrandCode,
      metacityStoreIdx,
      metacityAccessCode,
      metacityMembershipType,
      yahwaEnabled,
      locationGuardEnabled,
      locationGuardRadiusM,
    } = req.body;

    // 메타씨티 회원 유형 정규화
    // - 허용값: 'INTEGRATED' | 'STANDALONE'
    // - 그 외 값은 'INTEGRATED' 로 정규화
    // - 부정합 조합 차단: metacityEnabled === false 인데 STANDALONE 요청 → INTEGRATED 로 강제
    let normalizedMembershipType: 'INTEGRATED' | 'STANDALONE' | undefined;
    if (metacityMembershipType !== undefined) {
      const raw = String(metacityMembershipType);
      normalizedMembershipType = raw === 'STANDALONE' ? 'STANDALONE' : 'INTEGRATED';
      const effectiveMetacityEnabled = metacityEnabled !== undefined ? !!metacityEnabled : undefined;
      if (effectiveMetacityEnabled === false && normalizedMembershipType === 'STANDALONE') {
        normalizedMembershipType = 'INTEGRATED';
      }
    }

    // 매장 확인 (스탬프 설정과 OWNER 이메일도 함께 조회)
    const existingStore = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        stampSetting: true,
        staffUsers: {
          where: { role: 'OWNER' },
          select: { email: true },
          take: 1,
        },
      },
    });

    if (!existingStore) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug 중복 체크 (변경하려는 경우)
    if (slug && slug !== existingStore.slug) {
      const slugExists = await prisma.store.findFirst({
        where: {
          slug,
          id: { not: storeId },
        },
      });

      if (slugExists) {
        return res.status(400).json({ error: '이미 사용 중인 slug입니다.' });
      }
    }

    // 주소 변경 시 자동 파싱하여 addressSido/Sigungu/Detail도 함께 업데이트
    const addressUpdateFields: Record<string, any> = {};
    if (address !== undefined) {
      const addrStr = (address || '').trim();
      addressUpdateFields.address = addrStr || null;
      if (addrStr) {
        const parsed = parseKoreanAddress(addrStr);
        addressUpdateFields.addressSido = parsed.sido;
        addressUpdateFields.addressSigungu = parsed.sigungu;
        addressUpdateFields.addressDetail = parsed.detail;
      } else {
        addressUpdateFields.addressSido = null;
        addressUpdateFields.addressSigungu = null;
        addressUpdateFields.addressDetail = null;
      }
    }

    // 매장 정보 업데이트
    const updatedStore = await prisma.store.update({
      where: { id: storeId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category || null }),
        ...(slug !== undefined && { slug: slug || null }),
        ...(ownerName !== undefined && { ownerName: ownerName || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(businessRegNumber !== undefined && { businessRegNumber: businessRegNumber || null }),
        ...addressUpdateFields,
        ...(pointRatePercent !== undefined && { pointRatePercent }),
        ...(pointUsageRule !== undefined && { pointUsageRule: pointUsageRule || null }),
        ...(pointsAlimtalkEnabled !== undefined && { pointsAlimtalkEnabled }),
        ...(crmEnabled !== undefined && { crmEnabled }),
        ...(enrollmentMode !== undefined && ['POINTS', 'STAMP', 'MEMBERSHIP'].includes(enrollmentMode) && { enrollmentMode }),
        ...(taghereVersion !== undefined && ['v1', 'v2'].includes(taghereVersion) && { taghereVersion }),
        ...(metacityEnabled !== undefined && { metacityEnabled }),
        ...(metacityBrandCode !== undefined && { metacityBrandCode: metacityBrandCode || null }),
        ...(metacityStoreIdx !== undefined && { metacityStoreIdx: metacityStoreIdx || null }),
        ...(metacityAccessCode !== undefined && { metacityAccessCode: metacityAccessCode || null }),
        ...(normalizedMembershipType !== undefined && { metacityMembershipType: normalizedMembershipType }),
        ...(yahwaEnabled !== undefined && { yahwaEnabled: !!yahwaEnabled }),
      } as any,
    });

    // enrollmentMode 를 STAMP 로 수정하면 스탬프 적립 기능 자동 활성화
    if (enrollmentMode === 'STAMP') {
      await ensureStampEnabled(prisma, storeId);
    }

    // 위치 기반 적립 확인 (매장별 토글, 기본 OFF)
    let locationGuardWarning: string | null = null;
    if (locationGuardEnabled !== undefined || locationGuardRadiusM !== undefined) {
      const radius =
        locationGuardRadiusM !== undefined
          ? Math.max(50, Math.min(2000, Number(locationGuardRadiusM) || 200))
          : undefined;
      await prisma.stampSetting.upsert({
        where: { storeId },
        create: {
          storeId,
          ...(locationGuardEnabled !== undefined && { locationGuardEnabled: !!locationGuardEnabled }),
          ...(radius !== undefined && { locationGuardRadiusM: radius }),
        },
        update: {
          ...(locationGuardEnabled !== undefined && { locationGuardEnabled: !!locationGuardEnabled }),
          ...(radius !== undefined && { locationGuardRadiusM: radius }),
        },
      });

      // 켜는 경우: 매장 좌표가 없으면 주소 지오코딩 시도. 실패하면 경고 반환 (좌표 없으면 가드 미발동).
      if (locationGuardEnabled === true && updatedStore.latitude == null) {
        const addr = (address !== undefined ? address : existingStore.address) || '';
        const geo = addr ? await geocodeAddress(addr) : null;
        if (geo) {
          await prisma.store.update({
            where: { id: storeId },
            data: { latitude: geo.latitude, longitude: geo.longitude },
          });
          console.log(`[Admin] Store ${storeId} geocoded: ${geo.latitude},${geo.longitude} (${geo.matchedAddress})`);
        } else {
          locationGuardWarning =
            '주소 좌표 변환에 실패했습니다. 주소를 확인해주세요. 좌표가 없으면 위치 확인이 동작하지 않습니다.';
          console.warn(`[Admin] Store ${storeId} geocode failed for address: ${addr}`);
        }
      }
    }

    // 주소가 변경됐고 좌표가 이미 있던 매장이면 좌표 재계산 (best-effort)
    if (address !== undefined && existingStore.latitude != null) {
      const addrStr = (address || '').trim();
      const geo = addrStr ? await geocodeAddress(addrStr) : null;
      await prisma.store.update({
        where: { id: storeId },
        data: { latitude: geo?.latitude ?? null, longitude: geo?.longitude ?? null },
      });
    }

    // CRM 활성화 상태 변경, taghereVersion 변경, 또는 enrollmentMode 변경 시 태그히어 서버에 알림
    const wasCrmEnabled = (existingStore as any).crmEnabled ?? true;
    const wasVersion = existingStore.taghereVersion;
    const wasEnrollmentMode = existingStore.enrollmentMode;
    const versionChanged = taghereVersion !== undefined && taghereVersion !== wasVersion;
    const crmToggled = crmEnabled !== undefined && crmEnabled !== wasCrmEnabled;
    const enrollmentModeChanged = enrollmentMode !== undefined && enrollmentMode !== wasEnrollmentMode;

    // 메타씨티 설정(활성화 / 회원 유형)이 요청에 포함되면 V2 StoreSetting 으로 항상 현재값 동기화.
    // (값 변경 여부와 무관하게 전송 — 마이그레이션 기본값 리셋 등으로 V2 가 조용히 stale 되는 것을 방지)
    const wasMetacityEnabled = (existingStore as any).metacityEnabled ?? false;
    const wasMembershipType = ((existingStore as any).metacityMembershipType ?? 'INTEGRATED') as 'INTEGRATED' | 'STANDALONE';
    const metacitySettingsPresent = metacityEnabled !== undefined || metacityMembershipType !== undefined;
    const effectiveStoreSlug = slug || existingStore.slug;
    if (metacitySettingsPresent && effectiveStoreSlug) {
      const effectiveMetacityEnabled = metacityEnabled !== undefined ? !!metacityEnabled : !!wasMetacityEnabled;
      const effectiveMembershipType = (normalizedMembershipType ?? wasMembershipType) as 'INTEGRATED' | 'STANDALONE';
      notifyStoreMetacitySettingsToV2({
        crmStoreSlug: effectiveStoreSlug,
        metacityEnabled: effectiveMetacityEnabled,
        metacityMembershipType: effectiveMembershipType,
      }).catch(err => console.error('[Admin] V2 metacity settings sync failed:', err));
    }

    if (crmToggled || versionChanged || enrollmentModeChanged) {
      const ownerEmail = existingStore.staffUsers?.[0]?.email;
      const storeSlug = slug || existingStore.slug;

      if (storeSlug) {
        const isStampMode = enrollmentMode === 'STAMP' || (existingStore.stampSetting?.enabled ?? false);
        const effectiveVersion = taghereVersion || existingStore.taghereVersion;
        const effectiveCrmEnabled = crmEnabled ?? wasCrmEnabled;
        const effectiveEnrollmentMode = enrollmentMode || existingStore.enrollmentMode;
        const baseParams = {
          userId: ownerEmail,
          storeName: existingStore.name,
          slug: storeSlug,
          isStampMode,
          enrollmentMode: effectiveEnrollmentMode,
        };

        if (versionChanged && effectiveCrmEnabled) {
          // 버전 변경 시: 구 버전 OFF → 신 버전 ON (redirect URL 파라미터명 변경)
          await notifyCrmOff({ ...baseParams, version: wasVersion });
          console.log(`[Admin] CRM off (old version ${wasVersion}) for store ${storeId}`);
          await notifyCrmOn({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM on (new version ${effectiveVersion}) for store ${storeId}, isStampMode: ${isStampMode}`);
        } else if (effectiveCrmEnabled) {
          await notifyCrmOn({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM on for store ${storeId}, version: ${effectiveVersion}, isStampMode: ${isStampMode}`);
        } else {
          await notifyCrmOff({ ...baseParams, version: effectiveVersion });
          console.log(`[Admin] CRM off for store ${storeId}, version: ${effectiveVersion}, isStampMode: ${isStampMode}`);
        }
      } else {
        console.log(`[Admin] Store ${storeId} missing slug, skipped TagHere notification`);
      }
    }

    res.json({
      success: true,
      message: '매장 정보가 수정되었습니다.',
      store: updatedStore,
      ...(locationGuardWarning ? { locationGuardWarning } : {}),
    });
  } catch (error) {
    console.error('Admin update store error:', error);
    res.status(500).json({ error: '매장 정보 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/resync-metacity-to-v2 - V2 StoreSetting 강제 재동기화
// CRM ↔ V2 webhook 이 실패했을 때 어드민이 수동으로 재시도 가능
router.post('/stores/:storeId/resync-metacity-to-v2', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        slug: true,
        metacityEnabled: true,
        metacityMembershipType: true,
      },
    });

    if (!store || !store.slug) {
      return res.status(404).json({ error: '매장을 찾을 수 없거나 slug 가 없습니다.' });
    }

    await notifyStoreMetacitySettingsToV2({
      crmStoreSlug: store.slug,
      metacityEnabled: !!store.metacityEnabled,
      metacityMembershipType: store.metacityMembershipType === 'STANDALONE' ? 'STANDALONE' : 'INTEGRATED',
    });

    res.json({
      success: true,
      message: 'V2 매장 설정 재동기화 요청을 보냈습니다.',
    });
  } catch (error) {
    console.error('Admin resync metacity to V2 error:', error);
    res.status(500).json({ error: '재동기화 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/discover-metacity-store-idx
// 매직포스 Agent 가 연결된 매장에 한해 V2 → Agent → 매장 POS WORK_CD=1100 호출로 STORE_IDX 자동 발견
router.post('/stores/:storeId/discover-metacity-store-idx', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { slug: true },
    });

    if (!store || !store.slug) {
      return res.status(404).json({ error: '매장을 찾을 수 없거나 slug 가 없습니다.' });
    }

    const result = await discoverMetacityStoreIdxFromV2(store.slug);
    return res.json({ success: true, storeIdx: result.storeIdx, storeName: result.storeName });
  } catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    const message = status === 503
      ? '매직포스 Agent 가 연결되지 않았거나 응답이 없습니다.'
      : status === 404
        ? '매장을 찾을 수 없습니다.'
        : (error?.message || '매장 코드 자동 발견 중 오류가 발생했습니다.');
    console.error('Admin discover metacity storeIdx error:', error);
    return res.status(status).json({ error: message });
  }
});

// GET /api/admin/stores/:storeId/wallet - 매장 충전금 조회
router.get('/stores/:storeId/wallet', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!wallet) {
      return res.json({ balance: 0, walletExists: false });
    }

    res.json({
      balance: wallet.balance,
      walletExists: true,
      updatedAt: wallet.updatedAt,
    });
  } catch (error) {
    console.error('Admin wallet error:', error);
    res.status(500).json({ error: '충전금 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/wallet/topup - 매장 충전금 충전
router.post('/stores/:storeId/wallet/topup', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 충전 금액을 입력해주세요.' });
    }

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 지갑이 없으면 생성, 있으면 업데이트
    const wallet = await prisma.wallet.upsert({
      where: { storeId },
      create: {
        storeId,
        balance: amount,
      },
      update: {
        balance: { increment: amount },
      },
    });

    // 결제 트랜잭션 기록
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount,
        type: 'TOPUP',
        status: 'SUCCESS',
        meta: {
          paymentMethod: 'ADMIN',
          description: reason || '관리자 충전',
        },
      },
    });

    res.json({
      success: true,
      message: `${store.name} 매장에 ${amount.toLocaleString()}원이 충전되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin wallet topup error:', error);
    res.status(500).json({ error: '충전 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/:storeId/wallet/deduct - 매장 충전금 차감 (삭제)
router.post('/stores/:storeId/wallet/deduct', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 차감 금액을 입력해주세요.' });
    }

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 현재 지갑 잔액 확인
    const currentWallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (!currentWallet) {
      return res.status(400).json({ error: '지갑이 존재하지 않습니다.' });
    }

    if (currentWallet.balance < amount) {
      return res.status(400).json({ error: '잔액이 부족합니다.' });
    }

    // 잔액 차감
    const wallet = await prisma.wallet.update({
      where: { storeId },
      data: {
        balance: { decrement: amount },
      },
    });

    // 결제 트랜잭션 기록 (차감)
    await prisma.paymentTransaction.create({
      data: {
        storeId,
        amount: -amount,
        type: 'DEDUCT',
        status: 'SUCCESS',
        meta: {
          paymentMethod: 'ADMIN',
          description: reason || '관리자 차감',
        },
      },
    });

    res.json({
      success: true,
      message: `${store.name} 매장에서 ${amount.toLocaleString()}원이 차감되었습니다.`,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error('Admin wallet deduct error:', error);
    res.status(500).json({ error: '차감 중 오류가 발생했습니다.' });
  }
});

// ========================================
// 공지사항 관리 API
// ========================================

// DELETE /api/admin/stores/:storeId/customers - 매장의 모든 고객 삭제
router.delete('/stores/:storeId/customers', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    // 매장 확인
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        _count: {
          select: { customers: true },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const customerCount = store._count.customers;

    if (customerCount === 0) {
      return res.status(400).json({ error: '삭제할 고객이 없습니다.' });
    }

    // 트랜잭션으로 관련 데이터 모두 삭제
    await prisma.$transaction(async (tx) => {
      // 먼저 해당 매장의 모든 고객 ID를 조회
      const customers = await tx.customer.findMany({
        where: { storeId },
        select: { id: true },
      });
      const customerIds = customers.map(c => c.id);

      // 1. 고객의 포인트 원장 삭제
      await tx.pointLedger.deleteMany({
        where: {
          customerId: { in: customerIds },
        },
      });

      // 2. 고객 피드백 삭제
      await tx.customerFeedback.deleteMany({
        where: {
          customerId: { in: customerIds },
        },
      });

      // 3. 리뷰 요청 로그에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.reviewRequestLog.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 4. 알림톡 아웃박스에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.alimTalkOutbox.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 5. SMS 메시지에서 고객 참조 null 처리 (customerId는 nullable)
      await tx.smsMessage.updateMany({
        where: {
          customerId: { in: customerIds },
        },
        data: {
          customerId: null,
        },
      });

      // 6. 최종적으로 고객 삭제
      await tx.customer.deleteMany({
        where: { storeId },
      });
    });

    res.json({
      success: true,
      message: `${store.name} 매장의 고객 ${customerCount}명이 삭제되었습니다.`,
      deletedCount: customerCount,
    });
  } catch (error) {
    console.error('Admin delete customers error:', error);
    res.status(500).json({ error: '고객 삭제 중 오류가 발생했습니다.' });
  }
});

// ========================================
// 주문완료 배너 관리 API
// ========================================

// POST /api/admin/stores/:storeId/impersonate - 매장 대리 로그인 (홈 화면 열기)
router.post('/stores/:storeId/impersonate', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    // 매장 및 Owner 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        staffUsers: {
          where: { role: 'OWNER' },
          take: 1,
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const owner = store.staffUsers[0];

    if (!owner) {
      return res.status(404).json({ error: '매장 점주를 찾을 수 없습니다.' });
    }

    // Store Owner JWT 토큰 생성 (1시간 만료)
    const token = jwt.sign(
      {
        id: owner.id,
        email: owner.email,
        storeId: store.id,
        role: owner.role,
        isAdmin: false,
        isImpersonated: true,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      storeName: store.name,
    });
  } catch (error) {
    console.error('Admin impersonate error:', error);
    res.status(500).json({ error: '대리 로그인 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 프랜차이즈 관리 API
// ============================================

// GET /api/admin/stores/available - 프랜차이즈 미연결 매장 목록 조회
router.get('/stores/available', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      where: {
        franchiseId: null, // 프랜차이즈에 연결되지 않은 매장만
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        ownerName: true,
        phone: true,
        address: true,
        createdAt: true,
        _count: {
          select: {
            customers: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ stores });
  } catch (error: any) {
    console.error('Failed to fetch available stores:', error);
    res.status(500).json({ error: '매장 목록 조회에 실패했습니다.' });
  }
});

// POST /api/admin/stores/bulk - 매장 대량 등록
router.post('/stores/bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { stores: storeRows, defaultPassword, franchiseId, enrollmentMode } = req.body;

    if (!Array.isArray(storeRows) || storeRows.length === 0) {
      return res.status(400).json({ error: '등록할 매장 데이터가 없습니다.' });
    }

    if (storeRows.length > 500) {
      return res.status(400).json({ error: '한 번에 최대 500개까지 등록 가능합니다.' });
    }

    const password = defaultPassword || '123456789a';
    const passwordHash = await bcrypt.hash(password, 10);

    // 이메일 중복 체크를 위해 기존 이메일 조회
    const existingEmails = new Set(
      (await prisma.staffUser.findMany({ select: { email: true } })).map((u: any) => u.email)
    );

    const created: Array<{ row: number; storeName: string; email: string }> = [];
    const errors: Array<{ row: number; storeName: string; reason: string }> = [];
    const crmOnResults: Array<{ storeName: string; success: boolean; error?: string }> = [];
    const emailsInBatch = new Set<string>();

    for (let i = 0; i < storeRows.length; i++) {
      const row = storeRows[i];
      const rowNum = i + 2; // 엑셀 기준 (헤더=1행)
      const storeName = row.storeName?.trim();
      const ownerName = row.ownerName?.trim() || '';
      const phone = row.phone?.trim() || '';
      const email = row.email?.trim()?.toLowerCase();
      const businessRegNumber = row.businessRegNumber?.trim() || null;
      const address = row.address?.trim() || '';
      const category = row.category?.trim() || null;

      // 필수 필드 검증
      if (!storeName) {
        errors.push({ row: rowNum, storeName: storeName || '-', reason: '상호명이 없습니다.' });
        continue;
      }

      if (!email) {
        errors.push({ row: rowNum, storeName, reason: '이메일이 없습니다.' });
        continue;
      }

      // 이메일 형식 검증
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, storeName, reason: '이메일 형식이 올바르지 않습니다.' });
        continue;
      }

      // 이메일 중복 체크 (DB + 배치 내)
      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, storeName, reason: `이미 사용 중인 이메일입니다. (${email})` });
        continue;
      }
      if (emailsInBatch.has(email)) {
        errors.push({ row: rowNum, storeName, reason: `파일 내 중복 이메일입니다. (${email})` });
        continue;
      }

      try {
        const baseSlug = generateSlug(storeName);
        const slug = await getUniqueSlug(baseSlug);
        const validEnrollmentMode = enrollmentMode && ['POINTS', 'STAMP', 'MEMBERSHIP'].includes(enrollmentMode)
          ? enrollmentMode
          : undefined;

        await prisma.$transaction(async (tx) => {
          const store = await tx.store.create({
            data: {
              name: storeName,
              slug,
              ownerName: ownerName || null,
              phone: phone || null,
              businessRegNumber,
              address: address || null,
              category: category || null,
              pointRatePercent: 5,
              franchiseId: franchiseId || null,
              ...(validEnrollmentMode && { enrollmentMode: validEnrollmentMode }),
            },
          });

          // 스탬프 적립 모드로 생성하는 경우 스탬프 기능 자동 활성화
          if (validEnrollmentMode === 'STAMP') {
            await ensureStampEnabled(tx, store.id);
          }

          await tx.wallet.create({
            data: { storeId: store.id, balance: 500 },
          });

          await tx.waitingSetting.create({
            data: { storeId: store.id, operationStatus: 'ACCEPTING' },
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

          await tx.staffUser.create({
            data: {
              storeId: store.id,
              email,
              passwordHash,
              name: ownerName || storeName,
              role: 'OWNER',
            },
          });

          // 테이블 채팅 기본 활성화
          await tx.chatSetting.create({
            data: {
              storeId: store.id,
              enabled: true,
            },
          });

          // 방문경로 설정 기본 활성화
          await tx.visitSourceSetting.create({
            data: {
              storeId: store.id,
              enabled: true,
              options: [
                { id: 'revisit', label: '단순 재방문', order: 1, enabled: true },
                { id: 'friend', label: '지인 추천', order: 2, enabled: true },
                { id: 'naver', label: '네이버', order: 3, enabled: true },
                { id: 'youtube', label: '유튜브', order: 4, enabled: true },
                { id: 'daangn', label: '당근', order: 5, enabled: true },
                { id: 'instagram', label: '인스타그램', order: 6, enabled: true },
                { id: 'sms', label: '문자', order: 7, enabled: true },
                { id: 'kakao', label: '카카오톡', order: 8, enabled: true },
                { id: 'passby', label: '지나가다 방문', order: 9, enabled: true },
              ],
            },
          });
        });

        emailsInBatch.add(email);
        existingEmails.add(email);
        created.push({ row: rowNum, storeName, email });

        // 태그히어 서버에 CRM ON 알림 (리다이렉트 URL 등록)
        try {
          await notifyCrmOn({
            version: 'v1',
            userId: email,
            storeName,
            slug,
            isStampMode: validEnrollmentMode === 'STAMP',
            enrollmentMode: validEnrollmentMode || 'POINTS',
          });
          crmOnResults.push({ storeName, success: true });
        } catch (crmErr: any) {
          console.error(`[Admin Bulk] notifyCrmOn failed for ${storeName}:`, crmErr);
          crmOnResults.push({ storeName, success: false, error: crmErr.message || 'CRM ON 실패' });
        }
      } catch (err: any) {
        errors.push({ row: rowNum, storeName, reason: err.message || '생성 중 오류' });
      }
    }

    const crmOnSuccess = crmOnResults.filter(r => r.success).length;
    const crmOnFailed = crmOnResults.filter(r => !r.success);

    res.json({
      total: storeRows.length,
      created: created.length,
      errors,
      defaultPassword: password,
      crmOn: {
        success: crmOnSuccess,
        failed: crmOnFailed.length,
        failures: crmOnFailed,
      },
    });
  } catch (error) {
    console.error('Admin bulk store registration error:', error);
    res.status(500).json({ error: '매장 대량 등록 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/stores/enrollment-stats - 등록 모드별 매장 현황
router.get('/stores/enrollment-stats', adminAuthMiddleware, async (req, res) => {
  try {
    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        enrollmentMode: true,
        crmEnabled: true,
        _count: { select: { customers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: stores.length,
      byMode: {
        POINTS: stores.filter(s => s.enrollmentMode === 'POINTS').length,
        STAMP: stores.filter(s => s.enrollmentMode === 'STAMP').length,
        MEMBERSHIP: stores.filter(s => s.enrollmentMode === 'MEMBERSHIP').length,
      },
      withoutSlug: stores.filter(s => !s.slug).length,
      crmDisabled: stores.filter(s => !s.crmEnabled).length,
    };

    res.json({
      stats,
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        enrollmentMode: s.enrollmentMode,
        crmEnabled: s.crmEnabled,
        customerCount: s._count.customers,
      })),
    });
  } catch (error) {
    console.error('Admin enrollment stats error:', error);
    res.status(500).json({ error: '등록 모드 통계 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/stores/:storeId/enrollment-mode - 개별 매장 등록 모드 변경
router.put('/stores/:storeId/enrollment-mode', adminAuthMiddleware, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { mode } = req.body;

    if (!['POINTS', 'STAMP', 'MEMBERSHIP'].includes(mode)) {
      return res.status(400).json({ error: 'mode는 POINTS, STAMP, MEMBERSHIP 중 하나여야 합니다.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, slug: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug 없으면 자동 생성
    let slug = store.slug;
    if (!slug) {
      const baseSlug = generateSlug(store.name);
      slug = await getUniqueSlug(baseSlug);
    }

    await prisma.store.update({
      where: { id: storeId },
      data: {
        enrollmentMode: mode,
        crmEnabled: true,
        slug,
      },
    });

    // 스탬프 적립 모드로 변경하면 스탬프 기능 자동 활성화
    if (mode === 'STAMP') {
      await ensureStampEnabled(prisma, storeId);
    }

    res.json({ success: true, storeId, mode, slug });
  } catch (error) {
    console.error('Admin enrollment mode update error:', error);
    res.status(500).json({ error: '등록 모드 변경 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/stores/batch-membership-enable - 일괄 멤버십 모드 활성화
router.post('/stores/batch-membership-enable', adminAuthMiddleware, async (req, res) => {
  try {
    const { storeIds, dryRun = false } = req.body;

    // storeIds가 없으면 모든 POINTS 모드 매장 대상
    let targetStores;
    if (storeIds && Array.isArray(storeIds) && storeIds.length > 0) {
      targetStores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true, slug: true, enrollmentMode: true, crmEnabled: true },
      });
    } else {
      targetStores = await prisma.store.findMany({
        where: { enrollmentMode: { not: 'MEMBERSHIP' } },
        select: { id: true, name: true, slug: true, enrollmentMode: true, crmEnabled: true },
      });
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        total: targetStores.length,
        stores: targetStores.map(s => ({
          id: s.id,
          name: s.name,
          currentMode: s.enrollmentMode,
          hasSlug: !!s.slug,
        })),
      });
    }

    let enabled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const store of targetStores) {
      try {
        let slug = store.slug;
        if (!slug) {
          const baseSlug = generateSlug(store.name);
          slug = await getUniqueSlug(baseSlug);
        }

        await prisma.store.update({
          where: { id: store.id },
          data: {
            enrollmentMode: 'MEMBERSHIP',
            crmEnabled: true,
            slug,
          },
        });
        enabled++;
      } catch (err: any) {
        errors.push(`${store.name} (${store.id}): ${err.message}`);
        skipped++;
      }
    }

    res.json({
      dryRun: false,
      total: targetStores.length,
      enabled,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('Admin batch membership enable error:', error);
    res.status(500).json({ error: '일괄 멤버십 활성화 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 기업광고 알림톡 설정 (다중 쿠폰)
// ============================================

// POST /api/admin/stores/bulk-address
// 엑셀에서 파싱된 { items: [{ id, address }] } 배열을 받아 매장 주소 일괄 업데이트
router.post('/stores/bulk-address', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { items } = req.body as { items?: Array<{ id: string; address: string }> };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '업데이트할 항목이 없습니다.' });
    }
    if (items.length > 2000) {
      return res.status(400).json({ error: '한 번에 최대 2,000개까지 처리 가능합니다.' });
    }

    const failed: Array<{ id: string; name: string | null; address: string; reason: string }> = [];
    let updated = 0;

    for (const item of items) {
      const id = (item?.id || '').trim();
      const address = (item?.address || '').trim();
      if (!id || !address) continue;

      const store = await prisma.store.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!store) {
        failed.push({ id, name: null, address, reason: '매장 없음' });
        continue;
      }

      const parsed = parseKoreanAddress(address);
      if (!parsed.sido) {
        failed.push({ id, name: store.name, address, reason: '시도 파싱 실패' });
        continue;
      }

      await prisma.store.update({
        where: { id },
        data: {
          address,
          addressSido: parsed.sido,
          addressSigungu: parsed.sigungu,
          addressDetail: parsed.detail,
        } as any,
      });
      updated++;
    }

    res.json({ updated, failed, total: items.length });
  } catch (error) {
    console.error('Bulk address update error:', error);
    res.status(500).json({ error: '주소 일괄 업데이트 중 오류가 발생했습니다.' });
  }
});

export default router;
