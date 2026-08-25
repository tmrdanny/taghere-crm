// 환경변수 중앙 접근 모듈
//
// 규칙:
// - 모든 getter는 접근 시점마다 process.env를 읽는다 (lazy).
//   모듈 로드 시점 스냅샷 금지 — load-env.ts 실행 이후/테스트의 env 교체를 그대로 반영해야 함.
// - getter는 raw 값(string | undefined)을 반환한다.
//   fallback(`|| ...`)은 호출부마다 다르므로 각 호출부에서 유지한다. 여기에 기본값을 넣지 않는다.
// - NODE_ENV, DATABASE_URL(lib/prisma.ts) 등은 의도적으로 여기서 다루지 않는다.

export const env = {
  // ── 인증 ──
  get JWT_SECRET(): string | undefined {
    return process.env.JWT_SECRET;
  },

  // ── 솔라피 (알림톡/SMS) ──
  get SOLAPI_API_KEY(): string | undefined {
    return process.env.SOLAPI_API_KEY;
  },
  get SOLAPI_API_SECRET(): string | undefined {
    return process.env.SOLAPI_API_SECRET;
  },
  get SOLAPI_PF_ID(): string | undefined {
    return process.env.SOLAPI_PF_ID;
  },

  // ── 솔라피 알림톡 템플릿 ID ──
  get SOLAPI_TEMPLATE_ID_RETARGET_COUPON(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
  },
  get SOLAPI_TEMPLATE_ID_REVIEW_REQUEST(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_REVIEW_REQUEST;
  },
  get SOLAPI_TEMPLATE_ID_POINTS_EARNED(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_POINTS_EARNED;
  },
  get SOLAPI_TEMPLATE_ID_POINTS_USED(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_POINTS_USED;
  },
  get SOLAPI_TEMPLATE_ID_STAMP_HITEJINRO(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_STAMP_HITEJINRO;
  },
  get SOLAPI_TEMPLATE_ID_LOW_BALANCE(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_LOW_BALANCE;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_REGISTERED(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_REGISTERED;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_CALLED(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_CALLED;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_RECALLED(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_RECALLED;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_CUSTOMER(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_CUSTOMER;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_TIMEOUT(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_TIMEOUT;
  },
  get SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_STORE(): string | undefined {
    return process.env.SOLAPI_TEMPLATE_ID_WAITING_CANCELLED_STORE;
  },

  // ── Base URL 계열 (서로 다른 용도 — 통합 금지) ──
  get PUBLIC_APP_URL(): string | undefined {
    return process.env.PUBLIC_APP_URL;
  },
  get PUBLIC_URL(): string | undefined {
    return process.env.PUBLIC_URL;
  },
  get PUBLIC_BASE_URL(): string | undefined {
    return process.env.PUBLIC_BASE_URL;
  },
  get TAGHERE_CRM_BASE_URL(): string | undefined {
    return process.env.TAGHERE_CRM_BASE_URL;
  },

  // ── 토스페이먼츠 ──
  get TOSS_SECRET_KEY(): string | undefined {
    return process.env.TOSS_SECRET_KEY;
  },

  // ── 야화 웹훅 ──
  get YAHWA_WEBHOOK_URL(): string | undefined {
    return process.env.YAHWA_WEBHOOK_URL;
  },
  get YAHWA_WEBHOOK_SECRET(): string | undefined {
    return process.env.YAHWA_WEBHOOK_SECRET;
  },
};

// 알려진 env 그룹별 누락 경고 (warn-only — 절대 exit하지 않음)
// index.ts의 필수 env 검증(JWT_SECRET, DATABASE_URL) 이후에 한 번만 호출된다.
export function warnMissingEnv(): void {
  const groups: Record<string, string[]> = {
    SOLAPI: ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID'],
    TOSS: ['TOSS_SECRET_KEY'],
    YAHWA: ['YAHWA_WEBHOOK_URL', 'YAHWA_WEBHOOK_SECRET'],
  };

  for (const [group, keys] of Object.entries(groups)) {
    const missing = keys.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      console.warn(`⚠️  [env] ${group} 관련 환경변수 미설정: ${missing.join(', ')}`);
    }
  }
}
