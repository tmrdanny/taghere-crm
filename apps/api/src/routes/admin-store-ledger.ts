import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';
import { isStandaloneMagicposStore, STANDALONE_BLOCK_MESSAGE } from './points.js';

// 어드민 권한으로 매장 원장/고객을 보정하는 라우터.
// 매장 JWT 없이 운영 지원(게이트웨이·어드민 콘솔)에서 호출한다.
// 보정 전용이므로 적립/사용 플로우의 부수효과(알림톡, 메타씨티 동기화, 방문수)는 발생시키지 않는다.
//
// 미들웨어는 라우트별로 붙인다. 이 라우터는 admin.ts에서 경로 없이 마운트되므로
// router.use(adminAuthMiddleware)를 쓰면 /api/admin/* 전체(로그인 포함)가 막힌다.

const router = Router();

// 자릿수 오타를 막는 방어값. 이 범위를 넘는 보정은 사람이 직접 판단해야 한다.
const MAX_POINT_DELTA = 100_000;
const MAX_STAMP_DELTA = 1_000;

const ADJUST_REASON_PREFIX = '[어드민 보정]';

/** 보정 공통 입력 검증. 통과하면 null, 실패하면 에러 메시지를 돌려준다. */
function validateAdjustInput(
  customerId: unknown,
  delta: unknown,
  reason: unknown,
  maxDelta: number,
  unit: string,
): string | null {
  if (!customerId || typeof customerId !== 'string') {
    return '고객 ID가 필요합니다.';
  }
  if (typeof delta !== 'number' || delta === 0 || !Number.isInteger(delta)) {
    return `보정할 ${unit}를 0이 아닌 정수로 입력해주세요.`;
  }
  if (Math.abs(delta) > maxDelta) {
    return `한 번에 보정 가능한 범위(±${maxDelta.toLocaleString()})를 초과했습니다.`;
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return '보정 사유가 필요합니다.';
  }
  return null;
}

// POST /api/admin/stores/:storeId/points/adjust - 포인트 보정 (반대부호 기록 추가)
router.post(
  '/stores/:storeId/points/adjust',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { storeId } = req.params;
      const { customerId, delta, reason } = req.body;

      const invalid = validateAdjustInput(customerId, delta, reason, MAX_POINT_DELTA, '포인트');
      if (invalid) {
        return res.status(400).json({ error: invalid });
      }

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, metacityEnabled: true },
      });
      if (!store) {
        return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
      }

      // 매직포스 단독 회원 매장은 POS가 포인트의 진실원천이라 수동 조정 금지 (points.ts와 동일 규칙)
      if (await isStandaloneMagicposStore(storeId)) {
        return res.status(400).json({ error: STANDALONE_BLOCK_MESSAGE });
      }

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
        select: { id: true, totalPoints: true },
      });
      if (!customer) {
        return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
      }
      if (customer.totalPoints + delta < 0) {
        return res.status(400).json({
          error: `포인트가 부족합니다. (현재: ${customer.totalPoints}점)`,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        // 동시 보정 시 한쪽 delta가 유실되지 않도록 원자적 증감을 쓴다
        const updatedCustomer = await tx.customer.update({
          where: { id: customerId },
          data: { totalPoints: { increment: delta } },
        });
        if (updatedCustomer.totalPoints < 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        const ledger = await tx.pointLedger.create({
          data: {
            storeId,
            customerId,
            type: 'ADJUST',
            delta,
            balance: updatedCustomer.totalPoints,
            reason: `${ADJUST_REASON_PREFIX} ${reason.trim()}`,
          },
        });
        return { customer: updatedCustomer, ledger };
      });

      res.json({
        success: true,
        ledgerId: result.ledger.id,
        delta,
        balance: result.customer.totalPoints,
        // 이 API는 POS를 건드리지 않는다. 연동 매장은 POS 잔액을 따로 맞춰야 한다.
        posSynced: false,
        ...(store.metacityEnabled && {
          warning: '메타씨티 POS 잔액은 이 보정에 반영되지 않았습니다. 별도 확인이 필요합니다.',
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({ error: '포인트가 부족합니다.' });
      }
      console.error('Admin point adjust error:', error);
      res.status(500).json({ error: '포인트 보정 중 오류가 발생했습니다.' });
    }
  },
);

// POST /api/admin/stores/:storeId/stamps/adjust - 스탬프 보정
router.post(
  '/stores/:storeId/stamps/adjust',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { storeId } = req.params;
      const { customerId, delta, reason } = req.body;

      const invalid = validateAdjustInput(customerId, delta, reason, MAX_STAMP_DELTA, '스탬프 수');
      if (invalid) {
        return res.status(400).json({ error: invalid });
      }

      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!store) {
        return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
      }

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
        select: { id: true, totalStamps: true },
      });
      if (!customer) {
        return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
      }
      if (customer.totalStamps + delta < 0) {
        return res.status(400).json({
          error: `스탬프가 부족합니다. (현재: ${customer.totalStamps}개)`,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedCustomer = await tx.customer.update({
          where: { id: customerId },
          data: { totalStamps: { increment: delta } },
        });
        if (updatedCustomer.totalStamps < 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        const ledger = await tx.stampLedger.create({
          data: {
            storeId,
            customerId,
            type: delta > 0 ? 'ADMIN_ADD' : 'ADMIN_REMOVE',
            delta,
            balance: updatedCustomer.totalStamps,
            reason: `${ADJUST_REASON_PREFIX} ${reason.trim()}`,
          },
        });
        return { customer: updatedCustomer, ledger };
      });

      res.json({
        success: true,
        ledgerId: result.ledger.id,
        delta,
        balance: result.customer.totalStamps,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({ error: '스탬프가 부족합니다.' });
      }
      console.error('Admin stamp adjust error:', error);
      res.status(500).json({ error: '스탬프 보정 중 오류가 발생했습니다.' });
    }
  },
);

// POST /api/admin/stores/:storeId/alimtalk/:messageId/retry - 실패 알림톡 재시도
router.post(
  '/stores/:storeId/alimtalk/:messageId/retry',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { storeId, messageId } = req.params;

      const message = await prisma.alimTalkOutbox.findFirst({
        where: { id: messageId, storeId },
      });
      if (!message) {
        return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
      }
      if (message.status !== 'FAILED') {
        return res.status(400).json({ error: '실패한 메시지만 재시도할 수 있습니다.' });
      }

      await prisma.alimTalkOutbox.update({
        where: { id: messageId },
        data: { status: 'RETRY', retryCount: 0, failReason: null },
      });

      res.json({ success: true, messageId });
    } catch (error) {
      console.error('Admin alimtalk retry error:', error);
      res.status(500).json({ error: '알림톡 재시도 중 오류가 발생했습니다.' });
    }
  },
);

// DELETE /api/admin/stores/:storeId/customers/:customerId - 고객 1명 삭제
router.delete(
  '/stores/:storeId/customers/:customerId',
  adminAuthMiddleware,
  async (req: AdminRequest, res: Response) => {
    try {
      const { storeId, customerId } = req.params;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
      });
      if (!customer) {
        return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
      }

      await prisma.$transaction(async (tx) => {
        // onDelete 미지정 + 필수 FK라 반드시 선삭제해야 하는 것
        await tx.franchiseSmsMessage.deleteMany({ where: { customerId } });
        // optional FK — 명시적으로 끊어둔다
        await tx.waitingList.updateMany({
          where: { customerId },
          data: { customerId: null },
        });

        // Cascade: CustomerFeedback, VisitOrOrder, PointLedger, StampLedger,
        //          StampApprovalRequest, PendingPointAccrual, PendingStampAccrual,
        //          SurveyAnswer, AutomationLog
        // SetNull:  ReviewRequestLog, PointSession, RetargetCoupon, WaitingList(위에서 명시 처리)
        // 주의: AlimTalkOutbox/SmsMessage/BrandMessage의 customerId는 relation 없는
        //       스칼라라 dangling ID로 남는다 (정합성 영향 없음)
        await tx.customer.delete({ where: { id: customerId } });
      });

      res.json({ success: true, customerId });
    } catch (error) {
      console.error('Admin customer delete error:', error);
      res.status(500).json({ error: '고객 삭제 중 오류가 발생했습니다.' });
    }
  },
);

export default router;
