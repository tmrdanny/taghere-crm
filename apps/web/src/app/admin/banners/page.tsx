'use client';

import { useEffect, useState, useRef } from 'react';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  mediaType: 'IMAGE' | 'VIDEO';
  isActive: boolean;
  order: number;
  autoSlide: boolean;
  slideInterval: number;
  targetSlugs: string[];
  createdAt: string;
}

interface BannerModalData {
  mode: 'create' | 'edit';
  banner?: Banner;
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<BannerModalData | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formLinkUrl, setFormLinkUrl] = useState('');
  const [formMediaType, setFormMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formOrder, setFormOrder] = useState(0);
  const [formAutoSlide, setFormAutoSlide] = useState(true);
  const [formSlideInterval, setFormSlideInterval] = useState(3000);
  const [formTargetSlugs, setFormTargetSlugs] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBanners();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchBanners = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setBanners(data);
      }
    } catch (error) {
      console.error('Failed to fetch banners:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormTitle('');
    setFormImageUrl('');
    setFormLinkUrl('');
    setFormMediaType('IMAGE');
    setFormIsActive(true);
    setFormOrder(0);
    setFormAutoSlide(true);
    setFormSlideInterval(3000);
    setFormTargetSlugs('');
    setModal({ mode: 'create' });
  };

  const openEditModal = (banner: Banner) => {
    setFormTitle(banner.title);
    setFormImageUrl(banner.imageUrl);
    setFormLinkUrl(banner.linkUrl || '');
    setFormMediaType(banner.mediaType || 'IMAGE');
    setFormIsActive(banner.isActive);
    setFormOrder(banner.order);
    setFormAutoSlide(banner.autoSlide);
    setFormSlideInterval(banner.slideInterval);
    setFormTargetSlugs(banner.targetSlugs.join(', '));
    setModal({ mode: 'edit', banner });
  };

  const handleSubmit = async () => {
    if (!formTitle || !formImageUrl) {
      setToast({ message: '제목과 미디어를 입력해주세요.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSubmitting(true);

    const targetSlugsArray = formTargetSlugs
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const body = {
      title: formTitle,
      imageUrl: formImageUrl,
      linkUrl: formLinkUrl || null,
      mediaType: formMediaType,
      isActive: formIsActive,
      order: formOrder,
      autoSlide: formAutoSlide,
      slideInterval: formSlideInterval,
      targetSlugs: targetSlugsArray,
    };

    try {
      const url = modal?.mode === 'edit'
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners/${modal.banner?.id}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners`;

      const res = await fetch(url, {
        method: modal?.mode === 'edit' ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setToast({ message: modal?.mode === 'edit' ? '배너가 수정되었습니다.' : '배너가 생성되었습니다.', type: 'success' });
        setModal(null);
        fetchBanners();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (banner: Banner) => {
    if (!confirm(`"${banner.title}" 배너를 삭제하시겠습니까?`)) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners/${banner.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        setToast({ message: '배너가 삭제되었습니다.', type: 'success' });
        fetchBanners();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '삭제 중 오류가 발생했습니다.', type: 'error' });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    // 파일 타입 확인
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      setToast({ message: '이미지 또는 MP4 영상 파일만 업로드 가능합니다.', type: 'error' });
      return;
    }

    // 영상 용량 체크 (최대 20MB)
    if (isVideo && file.size > 20 * 1024 * 1024) {
      setToast({ message: '영상 파일은 20MB 이하만 업로드 가능합니다.', type: 'error' });
      return;
    }

    // 이미지 용량 체크 (최대 5MB)
    if (isImage && file.size > 5 * 1024 * 1024) {
      setToast({ message: '이미지 파일은 5MB 이하만 업로드 가능합니다.', type: 'error' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('media', file);

      // XMLHttpRequest로 진행률 표시
      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<{ mediaUrl: string; mediaType: 'IMAGE' | 'VIDEO' }>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || '업로드 실패'));
            } catch {
              reject(new Error('업로드 실패'));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('네트워크 오류')));
        xhr.addEventListener('abort', () => reject(new Error('업로드 취소됨')));

        xhr.open('POST', `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners/upload-media`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      const data = await uploadPromise;
      const fullMediaUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${data.mediaUrl}`;
      setFormImageUrl(fullMediaUrl);
      setFormMediaType(data.mediaType);
      setToast({ message: isVideo ? '영상이 업로드되었습니다.' : '이미지가 업로드되었습니다.', type: 'success' });
    } catch (error: any) {
      setToast({ message: error.message || '업로드 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleActive = async (banner: Banner) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/banners/${banner.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !banner.isActive }),
        }
      );

      if (res.ok) {
        setToast({ message: banner.isActive ? '배너가 비활성화되었습니다.' : '배너가 활성화되었습니다.', type: 'success' });
        fetchBanners();
      }
    } catch (error) {
      setToast({ message: '상태 변경 중 오류가 발생했습니다.', type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-lg text-sm font-medium z-50 ${
            toast.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">주문완료 배너</h1>
          <p className="text-neutral-500 mt-1">주문 완료 페이지에 표시되는 배너를 관리합니다 (이미지/영상)</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          배너 추가
        </button>
      </div>

      {/* Banners List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {banners.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            등록된 배너가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {banners.map((banner) => (
              <div key={banner.id} className="p-4 flex items-center gap-4">
                {/* Preview */}
                <div className="w-32 h-16 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0 relative">
                  {banner.mediaType === 'VIDEO' ? (
                    <>
                      <video
                        src={banner.imageUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      />
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                        영상
                      </div>
                    </>
                  ) : (
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect fill="%23333" width="100" height="50"/><text fill="%23666" x="50" y="28" text-anchor="middle" font-size="10">No Image</text></svg>';
                      }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white truncate">{banner.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        banner.mediaType === 'VIDEO'
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {banner.mediaType === 'VIDEO' ? '영상' : '이미지'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        banner.isActive
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-neutral-700 text-neutral-400'
                      }`}
                    >
                      {banner.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                    <span>순서: {banner.order}</span>
                    <span>자동 슬라이드: {banner.autoSlide ? `${banner.slideInterval / 1000}초` : '꺼짐'}</span>
                    <span>대상: {banner.targetSlugs.length > 0 ? banner.targetSlugs.join(', ') : '전체'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(banner)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      banner.isActive
                        ? 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                        : 'bg-green-600 text-white hover:bg-green-500'
                    }`}
                  >
                    {banner.isActive ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => openEditModal(banner)}
                    className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded text-xs font-medium hover:bg-neutral-700 transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(banner)}
                    className="px-3 py-1.5 bg-red-600/10 text-red-400 rounded text-xs font-medium hover:bg-red-600/20 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">
              {modal.mode === 'edit' ? '배너 수정' : '새 배너 추가'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  제목 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="배너 제목 (관리용)"
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  배너 미디어 <span className="text-red-400">*</span>
                </label>

                {/* 파일 업로드 버튼 */}
                <div className="flex gap-2 mb-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="banner-media-upload"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex-1 h-10 px-3 bg-neutral-800 border border-neutral-700 border-dashed rounded-lg text-sm text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                        업로드 중... {uploadProgress}%
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        이미지/영상 업로드
                      </>
                    )}
                  </button>
                </div>

                {/* 업로드 진행률 바 */}
                {isUploading && (
                  <div className="mb-2">
                    <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 미디어 미리보기 */}
                {formImageUrl ? (
                  <div className="relative rounded-lg overflow-hidden bg-neutral-800">
                    {formMediaType === 'VIDEO' ? (
                      <video
                        src={formImageUrl}
                        className="w-full h-40 object-cover"
                        muted
                        autoPlay
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={formImageUrl}
                        alt="Preview"
                        className="w-full h-40 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect fill="%23333" width="100" height="50"/><text fill="%23666" x="50" y="28" text-anchor="middle" font-size="8">이미지 로드 실패</text></svg>';
                        }}
                      />
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 rounded text-xs text-white">
                      {formMediaType === 'VIDEO' ? '영상' : '이미지'}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setFormImageUrl(''); setFormMediaType('IMAGE'); }}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="h-40 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                    <div className="text-center text-neutral-500">
                      <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-xs">이미지 또는 영상을 업로드해주세요</p>
                      <p className="text-xs mt-1">이미지: JPG, PNG, GIF, WebP (최대 5MB)</p>
                      <p className="text-xs">영상: MP4, WebM (최대 20MB)</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  링크 URL (선택)
                </label>
                <input
                  type="text"
                  value={formLinkUrl}
                  onChange={(e) => setFormLinkUrl(e.target.value)}
                  placeholder="클릭 시 이동할 URL"
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                    정렬 순서
                  </label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                    슬라이드 간격 (ms)
                  </label>
                  <input
                    type="number"
                    value={formSlideInterval}
                    onChange={(e) => setFormSlideInterval(parseInt(e.target.value) || 3000)}
                    className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  대상 매장 Slug (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={formTargetSlugs}
                  onChange={(e) => setFormTargetSlugs(e.target.value)}
                  placeholder="taghere-test, store-slug (비워두면 전체)"
                  className="w-full h-10 px-3 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <p className="text-xs text-neutral-500 mt-1">비워두면 모든 매장에 표시됩니다.</p>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-neutral-300">활성화</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAutoSlide}
                    onChange={(e) => setFormAutoSlide(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-neutral-300">자동 슬라이드</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModal(null)}
                className="flex-1 h-10 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formTitle || !formImageUrl}
                className="flex-1 h-10 bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </>
                ) : (
                  modal.mode === 'edit' ? '수정' : '추가'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
