'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Ticket, Plus, Trash2, Copy, Download, Link2, Pencil, Users, CheckCircle2, Image as ImageIcon } from 'lucide-react';

interface FormField {
  id: string;
  type: 'TEXT' | 'CHOICE';
  label: string;
  required: boolean;
  choiceOptions?: string[];
}

interface CouponFormLink {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  fields: FormField[];
  couponContent: string;
  expiryDate: string;
  enabled: boolean;
  createdAt: string;
  submissionCount: number;
  usedCount: number;
}

const newFieldId = () => `f_${Math.random().toString(36).slice(2, 9)}`;

export default function CouponLinksPage() {
  const { showToast, ToastComponent } = useToast();
  const [forms, setForms] = useState<CouponFormLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 생성/수정 모달
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [couponContent, setCouponContent] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');
  const [storeNaverPlaceUrl, setStoreNaverPlaceUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fullImageUrl = (url: string) => (url.startsWith('http') ? url : `${API_BASE}${url}`);

  // QR 표시 모달
  const [qrForm, setQrForm] = useState<CouponFormLink | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const getToken = () => localStorage.getItem('token');
  const webOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const formUrl = (slug: string) => `${webOrigin}/coupon-form/${slug}`;

  const fetchForms = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/coupon-form`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForms(data.forms || []);
        setStoreNaverPlaceUrl(data.naverPlaceUrl || '');
      }
    } catch (e) {
      console.error('Failed to fetch coupon forms:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  // ── 에디터 열기
  const openCreate = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setCouponContent('');
    setExpiryDate('');
    setNaverPlaceUrl(storeNaverPlaceUrl);
    setBannerUrl('');
    setFields([]);
    setIsEditorOpen(true);
  };

  const openEdit = (f: CouponFormLink) => {
    setEditingId(f.id);
    setTitle(f.title);
    setDescription(f.description || '');
    setCouponContent(f.couponContent);
    setExpiryDate(f.expiryDate);
    setNaverPlaceUrl(storeNaverPlaceUrl);
    setBannerUrl(f.bannerUrl || '');
    setFields(Array.isArray(f.fields) ? f.fields : []);
    setIsEditorOpen(true);
  };

  const handleBannerUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('이미지는 5MB 이하만 업로드할 수 있어요.', 'error');
      return;
    }
    setIsUploadingBanner(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/api/coupon-form/upload-banner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.bannerUrl) {
        setBannerUrl(data.bannerUrl);
      } else {
        showToast(data.error || '이미지 업로드에 실패했어요.', 'error');
      }
    } catch {
      showToast('이미지 업로드 중 오류가 발생했어요.', 'error');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  // ── 필드 빌더
  const addPreset = (preset: 'name' | 'gender' | 'custom') => {
    if (fields.length >= 10) {
      showToast('설문 항목은 최대 10개까지 추가할 수 있어요.', 'error');
      return;
    }
    if (preset === 'name') {
      setFields((prev) => [...prev, { id: newFieldId(), type: 'TEXT', label: '이름', required: false }]);
    } else if (preset === 'gender') {
      setFields((prev) => [
        ...prev,
        { id: newFieldId(), type: 'CHOICE', label: '성별', required: false, choiceOptions: ['남성', '여성'] },
      ]);
    } else {
      setFields((prev) => [...prev, { id: newFieldId(), type: 'TEXT', label: '', required: false }]);
    }
  };

  const updateField = (id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  // ── 저장
  const handleSave = async () => {
    if (!couponContent.trim()) {
      showToast('쿠폰 내용을 입력해주세요.', 'error');
      return;
    }
    if (!expiryDate.trim()) {
      showToast('유효기간을 입력해주세요.', 'error');
      return;
    }
    if (!naverPlaceUrl.trim()) {
      showToast('네이버 플레이스 URL을 입력해주세요.', 'error');
      return;
    }
    for (const f of fields) {
      if (!f.label.trim()) {
        showToast('항목 이름이 비어있는 설문 항목이 있어요.', 'error');
        return;
      }
      if (f.type === 'CHOICE' && (!f.choiceOptions || f.choiceOptions.length < 2)) {
        showToast(`'${f.label}' 항목의 선택지를 2개 이상 입력해주세요.`, 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const body = {
        title: title.trim() || '쿠폰 받기',
        description: description.trim(),
        couponContent: couponContent.trim(),
        expiryDate: expiryDate.trim(),
        naverPlaceUrl: naverPlaceUrl.trim(),
        bannerUrl: bannerUrl || '',
        fields,
      };
      const res = await fetch(`${API_BASE}/api/coupon-form${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(editingId ? '쿠폰 발행 링크가 수정됐어요.' : '쿠폰 발행 링크가 생성됐어요.', 'success');
        setIsEditorOpen(false);
        fetchForms();
      } else {
        showToast(data.error || '저장에 실패했어요.', 'error');
      }
    } catch {
      showToast('저장 중 오류가 발생했어요.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── 활성 토글 / 삭제
  const toggleEnabled = async (f: CouponFormLink) => {
    setForms((prev) => prev.map((x) => (x.id === f.id ? { ...x, enabled: !f.enabled } : x)));
    const res = await fetch(`${API_BASE}/api/coupon-form/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ enabled: !f.enabled }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setForms((prev) => prev.map((x) => (x.id === f.id ? { ...x, enabled: f.enabled } : x)));
      showToast('변경에 실패했어요.', 'error');
    }
  };

  const handleDelete = async (f: CouponFormLink) => {
    if (!window.confirm(`'${f.title}' 링크를 삭제할까요?\n제출 기록도 함께 삭제됩니다. (이미 발급된 쿠폰은 유지)`)) return;
    const res = await fetch(`${API_BASE}/api/coupon-form/${f.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).catch(() => null);
    if (res && res.ok) {
      showToast('삭제됐어요.', 'success');
      fetchForms();
    } else {
      showToast('삭제에 실패했어요.', 'error');
    }
  };

  // ── URL/QR 유틸
  const copyUrl = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(formUrl(slug));
      showToast('링크가 복사됐어요.', 'success');
    } catch {
      showToast('복사에 실패했어요.', 'error');
    }
  };

  const getQrCanvas = (): HTMLCanvasElement | null =>
    qrWrapRef.current?.querySelector('canvas') || null;

  const downloadQr = () => {
    const canvas = getQrCanvas();
    if (!canvas || !qrForm) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `쿠폰QR_${qrForm.title}.png`;
    a.click();
  };

  const copyQr = async () => {
    const canvas = getQrCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('no blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('QR 이미지가 복사됐어요.', 'success');
    } catch {
      showToast('이미지 복사를 지원하지 않는 브라우저예요. 다운로드를 이용해주세요.', 'error');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {ToastComponent}

      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Ticket className="w-6 h-6 text-neutral-700" />
            <h1 className="text-2xl font-bold text-neutral-900">쿠폰 발행 링크</h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1.5">
            쿠폰을 직접 만들고 QR코드로 출력하여 설문을 제출하신 손님들에게 자동으로 쿠폰을 발송해요
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          새 링크 만들기
        </Button>
      </div>

      {/* 비용 안내 */}
      <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-[13px] text-blue-700">
        설문이 제출될 때마다 쿠폰 알림톡이 자동 발송되며 <strong>건당 50원</strong>이 차감돼요. (월 무료 발송 건수가 남아있으면 무료로 발송)
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 bg-neutral-100 rounded-xl" />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-3">🎟️</div>
            <p className="text-neutral-900 font-medium mb-1">아직 만든 쿠폰 발행 링크가 없어요</p>
            <p className="text-sm text-neutral-500 mb-5">
              첫 링크를 만들고 QR을 매장에 붙여보세요. 손님이 설문을 제출하면 쿠폰이 자동 발송돼요.
            </p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              새 링크 만들기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {forms.map((f) => {
            const rate = f.submissionCount > 0 ? Math.round((f.usedCount / f.submissionCount) * 100) : 0;
            return (
              <Card key={f.id} className={!f.enabled ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{f.title}</CardTitle>
                      <p className="text-sm text-neutral-500 mt-0.5 truncate">
                        {f.couponContent} · 유효기간 {f.expiryDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-neutral-400">{f.enabled ? '진행 중' : '중지됨'}</span>
                      <Switch checked={f.enabled} onCheckedChange={() => toggleEnabled(f)} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* 통계 */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-neutral-50 rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[12px] text-neutral-500 mb-0.5">
                        <Users className="w-3.5 h-3.5" /> 쿠폰 발급
                      </div>
                      <p className="text-lg font-bold text-neutral-900">{f.submissionCount.toLocaleString()}명</p>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-[12px] text-neutral-500 mb-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 사용 완료
                      </div>
                      <p className="text-lg font-bold text-emerald-600">{f.usedCount.toLocaleString()}명</p>
                    </div>
                    <div className="bg-neutral-50 rounded-lg p-3 text-center">
                      <p className="text-[12px] text-neutral-500 mb-0.5">사용률</p>
                      <p className="text-lg font-bold text-neutral-900">{rate}%</p>
                    </div>
                  </div>

                  {/* 링크 + 액션 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-[200px] px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-[12px] text-neutral-600 font-mono truncate">
                      {formUrl(f.slug)}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyUrl(f.slug)}>
                      <Link2 className="w-4 h-4 mr-1" /> 링크 복사
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setQrForm(f)}>
                      QR 코드
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(f)}>
                      <Pencil className="w-4 h-4 mr-1" /> 수정
                    </Button>
                    <button
                      onClick={() => handleDelete(f)}
                      className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 생성/수정 모달 */}
      <Modal open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <ModalContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>{editingId ? '쿠폰 발행 링크 수정' : '새 쿠폰 발행 링크'}</ModalTitle>
          </ModalHeader>

          <div className="space-y-5 py-2">
            {/* 상단 배너 이미지 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">상단 배너 이미지 (선택)</label>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBannerUpload(file);
                  e.target.value = '';
                }}
              />
              {bannerUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fullImageUrl(bannerUrl)}
                    alt="배너 미리보기"
                    className="w-full max-h-48 object-cover rounded-lg border border-neutral-200"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => bannerInputRef.current?.click()} disabled={isUploadingBanner}>
                      {isUploadingBanner ? '업로드 중...' : '이미지 변경'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setBannerUrl('')}>
                      제거
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                  className="w-full py-8 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 transition-colors flex flex-col items-center gap-1"
                >
                  <ImageIcon className="w-6 h-6 text-neutral-400" />
                  {isUploadingBanner ? '업로드 중...' : '배너 이미지 업로드 (권장 비율 3:1, 최대 5MB)'}
                </button>
              )}
            </div>

            {/* 기본 정보 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">폼 제목</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 설문하고 아메리카노 쿠폰 받기" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">안내 문구 (선택)</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 30초만 참여하면 쿠폰을 드려요!" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  쿠폰 내용 <span className="text-red-500">*</span>
                </label>
                <Input value={couponContent} onChange={(e) => setCouponContent(e.target.value)} placeholder="예: 아메리카노 1잔 무료" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">
                  유효기간 <span className="text-red-500">*</span>
                </label>
                <Input value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} placeholder="예: 2026년 8월 31일까지" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">
                네이버 플레이스 URL <span className="text-red-500">*</span>
              </label>
              <Input
                value={naverPlaceUrl}
                onChange={(e) => setNaverPlaceUrl(e.target.value)}
                placeholder="예: https://naver.me/xxxxx 또는 네이버 플레이스 공유 링크"
              />
              <p className="text-xs text-neutral-400">
                쿠폰 알림톡의 길찾기 버튼에 사용돼요. 매장 정보에 함께 저장됩니다.
              </p>
            </div>

            {/* 설문 항목 */}
            <div className="space-y-3 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-700">설문 항목</label>
                <div className="flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => addPreset('name')}>+ 이름</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addPreset('gender')}>+ 성별</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addPreset('custom')}>+ 직접 추가</Button>
                </div>
              </div>

              {/* 연락처 고정 행 */}
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="flex-1 text-sm font-medium text-neutral-900">휴대폰 번호</span>
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">필수 · 고정</span>
              </div>

              {fields.map((f) => (
                <div key={f.id} className="p-3 bg-white rounded-lg border border-neutral-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={f.label}
                      onChange={(e) => updateField(f.id, { label: e.target.value })}
                      placeholder="항목 이름 (예: 이름)"
                      className="flex-1"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => {
                        const type = e.target.value as 'TEXT' | 'CHOICE';
                        updateField(f.id, {
                          type,
                          choiceOptions: type === 'CHOICE' ? (f.choiceOptions?.length ? f.choiceOptions : ['', '']) : undefined,
                        });
                      }}
                      className="px-2 py-2 border border-neutral-200 rounded-lg text-sm"
                    >
                      <option value="TEXT">주관식</option>
                      <option value="CHOICE">선택형</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-neutral-500 shrink-0">
                      필수
                      <Switch checked={f.required} onCheckedChange={(v) => updateField(f.id, { required: v })} />
                    </label>
                    <button onClick={() => removeField(f.id)} className="p-1.5 text-neutral-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {f.type === 'CHOICE' && (
                    <Input
                      value={(f.choiceOptions || []).join(', ')}
                      onChange={(e) =>
                        updateField(f.id, {
                          choiceOptions: e.target.value.split(',').map((s) => s.trimStart()),
                        })
                      }
                      placeholder="선택지를 쉼표로 구분해 입력 (예: 남성, 여성)"
                      className="text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <ModalFooter>
            <Button variant="secondary" onClick={() => setIsEditorOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? '저장 중...' : editingId ? '수정하기' : '만들기'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* QR 모달 */}
      <Modal open={!!qrForm} onOpenChange={(open) => !open && setQrForm(null)}>
        <ModalContent className="sm:max-w-sm">
          <ModalHeader>
            <ModalTitle>QR 코드</ModalTitle>
          </ModalHeader>
          {qrForm && (
            <div className="flex flex-col items-center py-4">
              <div ref={qrWrapRef} className="p-4 bg-white border border-neutral-200 rounded-xl">
                <QRCodeCanvas value={formUrl(qrForm.slug)} size={220} level="M" includeMargin />
              </div>
              <p className="mt-3 text-sm font-medium text-neutral-900">{qrForm.title}</p>
              <p className="text-xs text-neutral-400 mt-0.5 break-all text-center px-4">{formUrl(qrForm.slug)}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={copyQr}>
                  <Copy className="w-4 h-4 mr-1" /> 이미지 복사
                </Button>
                <Button size="sm" onClick={downloadQr}>
                  <Download className="w-4 h-4 mr-1" /> 다운로드
                </Button>
              </div>
            </div>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
