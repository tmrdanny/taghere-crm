import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { enqueueAlimTalk } from '../services/solapi.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// POST /api/admin/alimtalk/low-balance-bulk - 발송잔액 부족 알림 일괄 발송
router.post('/alimtalk/low-balance-bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { excludeStoreIds = [] } = req.body;
    const templateId = 'KA01TP26010513462218279L5IthM7TY';

    // 1. 300원 미만 매장 조회 (전화번호가 있는 매장만)
    const stores = await prisma.store.findMany({
      where: {
        phone: { not: null },
        wallet: {
          balance: { lt: 300 }
        },
        id: {
          notIn: excludeStoreIds
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        wallet: {
          select: { balance: true }
        }
      }
    });

    // 2. 날짜 기반 멱등성 키용 날짜 (KST)
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 3. 각 매장에 알림톡 발송 요청
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const store of stores) {
      const balance = store.wallet?.balance ?? 0;
      // 타임스탬프 기반 멱등성 키 - 매번 발송 가능하도록 변경
      const idempotencyKey = `admin_low_balance_bulk:${store.id}:${Date.now()}`;

      // #{상호명} 변수에 매장명 + 안내 문구 (줄바꿈 포함)
      const storeNameVariable = `${store.name}

현재 충전금이 부족하여 손님께 네이버 리뷰 안내와 포인트 적립 완료 알림톡이 전달되지 않고 있어요.

알림톡을 끄시려면 '설정 > 알림톡 발송 OFF'를 클릭해주세요.`;

      try {
        const result = await enqueueAlimTalk({
          storeId: store.id,
          phone: store.phone!,
          messageType: 'LOW_BALANCE',
          templateId,
          variables: {
            '#{상호명}': storeNameVariable,
            '#{잔액}': balance.toLocaleString(),
          },
          idempotencyKey,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${store.name}: ${result.error}`);
          }
        }
      } catch (err: any) {
        failed++;
        errors.push(`${store.name}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      totalStores: stores.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Low balance bulk notification error:', error);
    res.status(500).json({ error: error.message || '알림 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/alimtalk/customer-count-bulk - 누적 고객 알림 일괄 발송
router.post('/alimtalk/customer-count-bulk', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { minCustomers = 0, maxCustomers, excludeStoreIds = [] } = req.body;
    const templateId = 'KA01TP260318032138795sPQKm0yXShn';

    // 매장 조회 (전화번호가 있는 매장만, 고객수 포함)
    const stores = await prisma.store.findMany({
      where: {
        phone: { not: null },
        id: { notIn: excludeStoreIds },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        _count: { select: { customers: true } },
      },
    });

    // 고객수 필터링
    const filtered = stores.filter((s) => {
      const count = s._count.customers;
      if (count < minCustomers) return false;
      if (maxCustomers !== undefined && maxCustomers !== null && count > maxCustomers) return false;
      return true;
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const store of filtered) {
      const customerCount = store._count.customers;
      const idempotencyKey = `admin_customer_count_bulk:${store.id}:${Date.now()}`;

      try {
        const result = await enqueueAlimTalk({
          storeId: store.id,
          phone: store.phone!,
          messageType: 'CUSTOMER_COUNT',
          templateId,
          variables: {
            '#{고객수}': customerCount.toLocaleString(),
          },
          idempotencyKey,
        });

        if (result.success) {
          sent++;
        } else {
          failed++;
          if (result.error) errors.push(`${store.name}: ${result.error}`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${store.name}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      totalStores: filtered.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Customer count bulk notification error:', error);
    res.status(500).json({ error: error.message || '알림 발송 중 오류가 발생했습니다.' });
  }
});

export default router;
