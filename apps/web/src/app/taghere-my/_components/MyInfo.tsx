'use client';

// 내 정보 — 수신 동의 철회, 로그아웃, 탈퇴
import { useEffect, useState } from 'react';
import { customerFetch, CustomerAuthError, markPendingWithdraw, startKakaoLogin, startNaverLogin } from '../_lib/customer-session';

interface Props {
  customer: { name: string | null; phone: string | null; provider: 'kakao' | 'naver'; hasPhone: boolean };
  openWithdrawOnMount?: boolean;
  /** 재로그인 후 자동으로 연 탈퇴 확인 창을 한 번 띄웠음을 부모에 알린다 (다시 뜨지 않게) */
  onWithdrawPromptShown?: () => void;
  onLogout: () => void;
  onWithdrawn: () => void;
  onAuthExpired: () => void;
}

export default function MyInfo({ customer, openWithdrawOnMount, onWithdrawPromptShown, onLogout, onWithdrawn, onAuthExpired }: Props) {
  const [consentDone, setConsentDone] = useState(false);
  const [consentConfirm, setConsentConfirm] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!openWithdrawOnMount) return;
    setWithdrawConfirm(true);
    onWithdrawPromptShown?.();
  }, [openWithdrawOnMount, onWithdrawPromptShown]);

  const withdrawConsent = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await customerFetch('/api/my-page/consent/withdraw', { method: 'POST' });
      if (!res.ok) throw new Error();
      setConsentDone(true);
      setConsentConfirm(false);
    } catch (e) {
      if (e instanceof CustomerAuthError) return onAuthExpired();
      setMessage('수신 동의 철회에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await customerFetch('/api/my-page/withdraw', { method: 'POST' });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.code === 'REAUTH_REQUIRED') {
          setNeedsReauth(true);
          return;
        }
      }
      if (!res.ok) throw new Error();
      onWithdrawn();
    } catch (e) {
      if (e instanceof CustomerAuthError) return onAuthExpired();
      setMessage('탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reauth = () => {
    markPendingWithdraw();
    if (customer.provider === 'naver') startNaverLogin();
    else startKakaoLogin();
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-5 pb-8 space-y-4">
      <div className="border border-[#ebeced] rounded-[12px] p-4">
        <p className="text-xs text-[#91949a] mb-1">{customer.provider === 'naver' ? '네이버' : '카카오'}로 로그인됨</p>
        <p className="text-base font-bold text-[#1d2022]">{customer.name ? `${customer.name} 님` : '고객님'}</p>
        <p className="text-sm text-[#55595e] mt-0.5">{customer.phone ?? '휴대폰 번호 미제공'}</p>
      </div>

      <div className="border border-[#ebeced] rounded-[12px] p-4">
        <p className="text-sm font-semibold text-[#1d2022]">마케팅 정보 수신</p>
        <p className="text-xs text-[#91949a] mt-1 mb-3">
          태그히어 매장에서 보내는 혜택·이벤트 알림을 더 이상 받지 않아요. 태그히어가 보내는 신규 매장 소개 문자도 함께 멈춰요.
        </p>
        {consentDone ? (
          <p className="text-sm text-[#15803d]">수신 동의를 철회했어요.</p>
        ) : consentConfirm ? (
          <div className="flex gap-2">
            <button onClick={() => setConsentConfirm(false)} className="flex-1 py-2.5 bg-[#f0f1f2] text-[#55595e] text-sm font-semibold rounded-[10px]">
              취소
            </button>
            <button onClick={withdrawConsent} disabled={busy} className="flex-1 py-2.5 bg-[#1d2022] text-white text-sm font-semibold rounded-[10px] disabled:opacity-50">
              {busy ? '처리 중...' : '철회하기'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConsentConfirm(true)} className="w-full py-2.5 bg-[#f0f1f2] text-[#1d2022] text-sm font-semibold rounded-[10px]">
            수신 동의 철회
          </button>
        )}
      </div>

      {message && <p className="text-sm text-[#ef4444]">{message}</p>}

      <div className="flex flex-col items-center gap-3 pt-2">
        <button onClick={onLogout} className="text-sm text-[#55595e] underline underline-offset-2">
          로그아웃
        </button>
        <button onClick={() => setWithdrawConfirm(true)} className="text-xs text-[#b1b5b8] underline underline-offset-2">
          탈퇴하기
        </button>
      </div>

      {withdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div role="dialog" aria-label="탈퇴 확인" className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl">
            <h2 className="text-base font-bold text-[#1d2022] mb-1 text-center">정말 탈퇴할까요?</h2>
            {/* 재로그인 직후 자동으로 뜰 수 있으므로, 어느 계정이 탈퇴되는지 창 안에 보여준다 */}
            <p className="text-xs text-[#91949a] mb-3 text-center">
              {customer.provider === 'naver' ? '네이버' : '카카오'} · {customer.name ?? '고객님'} · {customer.phone ?? '번호 미제공'}
            </p>
            <ul className="text-sm text-[#55595e] space-y-1.5 mb-5 list-disc pl-4">
              <li>모든 태그히어 매장의 내 정보(이름·전화번호 등)가 삭제돼요.</li>
              <li>쌓아 둔 포인트·스탬프를 더 이상 쓸 수 없어요.</li>
              <li>같은 번호로 다시 적립하면 새 고객으로 시작해요.</li>
              <li>매직포스 통합회원 매장의 포인트는 포스에 남아 있어, 다시 가입하면 돌아올 수 있어요.</li>
            </ul>
            {needsReauth ? (
              <>
                <p className="text-xs text-[#91949a] mb-3 text-center">본인 확인을 위해 다시 로그인해주세요.</p>
                <button onClick={reauth} className="w-full py-3 bg-[#1d2022] text-white font-semibold text-sm rounded-xl">
                  다시 로그인하고 탈퇴하기
                </button>
                <button onClick={() => { setWithdrawConfirm(false); setNeedsReauth(false); }} className="w-full py-3 mt-2 text-[#55595e] text-sm">
                  취소
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setWithdrawConfirm(false)} className="flex-1 py-3 bg-[#f0f1f2] text-[#55595e] font-semibold text-sm rounded-xl">
                  취소
                </button>
                <button onClick={withdraw} disabled={busy} className="flex-1 py-3 bg-[#ef4444] text-white font-semibold text-sm rounded-xl disabled:opacity-50">
                  {busy ? '처리 중...' : '탈퇴하기'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
