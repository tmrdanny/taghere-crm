'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementFormData {
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  startAt: string;
  endAt: string;
}

const emptyFormData: AnnouncementFormData = {
  title: '',
  content: '',
  isActive: true,
  priority: 0,
  startAt: '',
  endAt: '',
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnnouncementFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);


  useEffect(() => {
    fetchAnnouncements();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchAnnouncements = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      setToast({ message: '공지사항 목록을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(emptyFormData);
    setShowModal(true);
  };

  const openEditModal = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      isActive: announcement.isActive,
      priority: announcement.priority,
      startAt: announcement.startAt ? announcement.startAt.split('T')[0] : '',
      endAt: announcement.endAt ? announcement.endAt.split('T')[0] : '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      setToast({ message: '제목과 내용을 입력해주세요.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSaving(true);

    try {
      const url = editingId
        ? `${API_BASE}/api/admin/announcements/${editingId}`
        : `${API_BASE}/api/admin/announcements`;

      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          isActive: formData.isActive,
          priority: formData.priority,
          startAt: formData.startAt || null,
          endAt: formData.endAt || null,
        }),
      });

      if (res.ok) {
        setToast({
          message: editingId ? '공지사항이 수정되었습니다.' : '공지사항이 생성되었습니다.',
          type: 'success',
        });
        setShowModal(false);
        fetchAnnouncements();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '저장에 실패했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setDeletingId(id);

    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setToast({ message: '공지사항이 삭제되었습니다.', type: 'success' });
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '삭제에 실패했습니다.', type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (announcement: Announcement) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/admin/announcements/${announcement.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !announcement.isActive }),
      });

      if (res.ok) {
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === announcement.id ? { ...a, isActive: !a.isActive } : a
          )
        );
        setToast({
          message: announcement.isActive ? '공지사항이 비활성화되었습니다.' : '공지사항이 활성화되었습니다.',
          type: 'success',
        });
      }
    } catch (error) {
      setToast({ message: '상태 변경에 실패했습니다.', type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inputCls =
    'w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none';
  const labelCls = 'mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]';

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-4 py-3 rounded-[10px] text-[13px] font-medium z-50 shadow-[0_8px_24px_-12px_rgba(19,22,81,0.35)] ${
            toast.type === 'success'
              ? 'bg-[#d9fad3] text-[color:var(--ad-pos)]'
              : 'bg-[#ffc4d0] text-[color:var(--ad-neg)]'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-[13px] text-[color:var(--ad-muted)]">전체 매장에 표시되는 공지사항을 관리합니다.</p>
        <button
          onClick={openCreateModal}
          className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 공지사항
        </button>
      </div>

      {/* Announcements List */}
      <div className="ad-card overflow-hidden">
        {announcements.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-[color:var(--ad-faint)]">
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--ad-line)]">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="p-5 hover:bg-[rgba(110,173,255,0.05)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          announcement.isActive
                            ? 'bg-[#d9fad3] text-[color:var(--ad-pos)]'
                            : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]'
                        }`}
                      >
                        {announcement.isActive ? '활성' : '비활성'}
                      </span>
                      {announcement.priority > 0 && (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#ffdace] text-[#993d1f]">
                          우선순위: {announcement.priority}
                        </span>
                      )}
                    </div>
                    <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)] truncate">
                      {announcement.title}
                    </h3>
                    <p className="text-[13px] text-[color:var(--ad-muted)] mt-1 line-clamp-2">
                      {announcement.content}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-[12px] text-[color:var(--ad-faint)] ad-tnum">
                      <span>
                        생성: {new Date(announcement.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      {announcement.startAt && (
                        <span>
                          시작: {new Date(announcement.startAt).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                      {announcement.endAt && (
                        <span>
                          종료: {new Date(announcement.endAt).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleActive(announcement)}
                      className={`ad-press p-2 rounded-[10px] transition-colors ${
                        announcement.isActive
                          ? 'text-[color:var(--ad-pos)] hover:bg-[#d9fad3]'
                          : 'text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg)]'
                      }`}
                      title={announcement.isActive ? '비활성화' : '활성화'}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {announcement.isActive ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        )}
                      </svg>
                    </button>
                    <button
                      onClick={() => openEditModal(announcement)}
                      className="ad-press p-2 text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-bg)] rounded-[10px] transition-colors"
                      title="수정"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      disabled={deletingId === announcement.id}
                      className="ad-press p-2 text-[color:var(--ad-neg)] hover:bg-[#ffc4d0]/50 rounded-[10px] transition-colors disabled:opacity-50"
                      title="삭제"
                    >
                      {deletingId === announcement.id ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.4)] backdrop-blur-sm flex items-center justify-center z-50">
          <div className="rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-[17px] font-bold text-[color:var(--ad-ink)] mb-4">
              {editingId ? '공지사항 수정' : '새 공지사항'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>
                  제목 <span className="text-[color:var(--ad-neg)]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="공지사항 제목"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>
                  내용 <span className="text-[color:var(--ad-neg)]">*</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="공지사항 내용을 입력하세요"
                  rows={5}
                  className="w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    우선순위
                  </label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className={inputCls}
                  />
                  <p className="text-[12px] text-[color:var(--ad-faint)] mt-1">높을수록 상단 표시</p>
                </div>

                <div>
                  <label className={labelCls}>
                    상태
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`ad-press w-full h-10 px-3 rounded-[10px] text-[13px] font-medium transition-colors ${
                      formData.isActive
                        ? 'bg-[#d9fad3] text-[color:var(--ad-pos)]'
                        : 'bg-white text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]'
                    }`}
                  >
                    {formData.isActive ? '활성화됨' : '비활성화됨'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    시작일 (선택)
                  </label>
                  <input
                    type="date"
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    종료일 (선택)
                  </label>
                  <input
                    type="date"
                    value={formData.endAt}
                    onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="ad-press flex-1 h-10 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.title || !formData.content}
                className="ad-press flex-1 h-10 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </>
                ) : (
                  editingId ? '수정하기' : '생성하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
