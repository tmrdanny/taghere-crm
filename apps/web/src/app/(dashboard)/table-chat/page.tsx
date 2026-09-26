'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { QRCodeCanvas } from 'qrcode.react';
import {
  MessageSquare,
  Pin,
  Trash2,
  RefreshCw,
  Download,
  Send,
  Plus,
  Edit3,
  X,
} from 'lucide-react';

const PUBLIC_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

type AuthMode = 'ANONYMOUS' | 'KAKAO';

interface ChatSetting {
  id: string;
  storeId: string;
  enabled: boolean;
  authMode: AuthMode;
  resetIntervalDays: number;
  resetHourKst: number;
  lastResetAt: string | null;
  welcomeMessage: string | null;
  profanityFilterEnabled: boolean;
}

interface ChatPost {
  id: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  senderType: 'USER' | 'STORE' | 'SYSTEM';
  nickname: string;
  content: string;
  createdAt: string;
}

export default function TableChatPage() {
  const { showToast, ToastComponent } = useToast();

  const [setting, setSetting] = useState<ChatSetting | null>(null);
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storeSlug, setStoreSlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editingPost, setEditingPost] = useState<ChatPost | null>(null);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostPinned, setNewPostPinned] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const qrRef = useRef<HTMLDivElement>(null);

  const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : '');

  const fetchAll = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const [settingRes, postsRes, messagesRes, storeRes] = await Promise.all([
        fetch(`${API_BASE}/api/chat/settings`, { headers }),
        fetch(`${API_BASE}/api/chat/posts`, { headers }),
        fetch(`${API_BASE}/api/chat/messages`, { headers }),
        fetch(`${API_BASE}/api/settings/store`, { headers }),
      ]);
      if (settingRes.ok) {
        const data = await settingRes.json();
        setSetting(data.setting);
      }
      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
      }
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }
      if (storeRes.ok) {
        const data = await storeRes.json();
        setStoreSlug(data.slug || '');
      }
    } catch (err) {
      console.error(err);
      showToast('데이터 로드 실패', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateSetting = async (patch: Partial<ChatSetting>) => {
    const token = getToken();
    if (!token || !setting) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setSetting(data.setting);
        showToast('저장되었습니다.', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || '저장 실패', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('저장 실패', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const savePost = async () => {
    if (!newPostContent.trim()) {
      showToast('내용을 입력해주세요.', 'error');
      return;
    }
    const token = getToken();
    if (!token) return;
    const url = editingPost ? `${API_BASE}/api/chat/posts/${editingPost.id}` : `${API_BASE}/api/chat/posts`;
    const method = editingPost ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPostTitle.trim() || null,
          content: newPostContent.trim(),
          isPinned: newPostPinned,
        }),
      });
      if (res.ok) {
        showToast(editingPost ? '게시글이 수정되었습니다.' : '게시글이 등록되었습니다.', 'success');
        setNewPostTitle('');
        setNewPostContent('');
        setNewPostPinned(false);
        setEditingPost(null);
        await fetchAll();
      } else {
        showToast('저장 실패', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('저장 실패', 'error');
    }
  };

  const startEditPost = (post: ChatPost) => {
    setEditingPost(post);
    setNewPostTitle(post.title ?? '');
    setNewPostContent(post.content);
    setNewPostPinned(post.isPinned);
  };

  const cancelEdit = () => {
    setEditingPost(null);
    setNewPostTitle('');
    setNewPostContent('');
    setNewPostPinned(false);
  };

  const deletePost = async (id: string) => {
    if (!confirm('게시글을 삭제하시겠습니까?')) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/posts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('삭제되었습니다.', 'success');
      await fetchAll();
    } else {
      showToast('삭제 실패', 'error');
    }
  };

  const togglePin = async (post: ChatPost) => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/posts/${post.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned: !post.isPinned }),
    });
    if (res.ok) await fetchAll();
  };

  const deleteMessage = async (id: string) => {
    if (!confirm('메시지를 삭제하시겠습니까?')) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/messages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const resetChat = async () => {
    if (!confirm('모든 메시지를 초기화하시겠습니까? (게시글은 유지됩니다)')) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      showToast('초기화되었습니다.', 'success');
      setMessages([]);
    }
  };

  const sendStoreMessage = async () => {
    if (!chatInput.trim()) return;
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chatInput.trim() }),
    });
    if (res.ok) {
      setChatInput('');
      await fetchAll();
    } else {
      showToast('송신 실패', 'error');
    }
  };

  const chatUrl = useMemo(() => {
    if (!storeSlug) return '';
    return `${PUBLIC_APP_URL}/chat/${storeSlug}`;
  }, [storeSlug]);

  const downloadQr = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storeSlug}-chat-qr.png`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <p className="text-[13px] text-[color:var(--ad-faint)]">로딩 중...</p>
      </div>
    );
  }

  if (!setting) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <p className="text-[13px] text-[color:var(--ad-faint)]">설정을 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)] flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          테이블 채팅
        </h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          매장 내 QR로 접속한 손님들이 실시간으로 소통할 수 있는 채팅방을 운영합니다.
        </p>
      </div>

      <div className="space-y-5">
        {/* 섹션 1: 기본 설정 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)]">기본 설정</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-medium text-[color:var(--ad-ink)]">채팅방 활성화</p>
                <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">활성화하면 고객이 QR로 채팅방에 접속할 수 있습니다.</p>
              </div>
              <Switch
                checked={setting.enabled}
                onCheckedChange={(v) => updateSetting({ enabled: v })}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[color:var(--ad-line)]">
              <div>
                <p className="text-[14px] font-medium text-[color:var(--ad-ink)]">욕설 자동 필터링</p>
                <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">
                  켜면 욕설이 포함된 메시지의 해당 단어가 자동으로 *로 마스킹됩니다.
                </p>
              </div>
              <Switch
                checked={setting.profanityFilterEnabled}
                onCheckedChange={(v) => updateSetting({ profanityFilterEnabled: v })}
                disabled={isSaving}
              />
            </div>
          </CardContent>
        </Card>

        {/* 섹션 2: 초기화 스케줄 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)]">채팅방 자동 초기화</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">초기화 주기 (일)</label>
                <select
                  value={setting.resetIntervalDays}
                  onChange={(e) => updateSetting({ resetIntervalDays: parseInt(e.target.value, 10) })}
                  disabled={isSaving}
                  className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {d}일마다
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">초기화 시각 (KST)</label>
                <select
                  value={setting.resetHourKst}
                  onChange={(e) => updateSetting({ resetHourKst: parseInt(e.target.value, 10) })}
                  disabled={isSaving}
                  className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">환영 메시지 (초기화 직후 표시)</label>
              <Input
                placeholder="예: 오늘 오시는 모든 손님을 환영합니다!"
                defaultValue={setting.welcomeMessage ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (setting.welcomeMessage ?? '')) {
                    updateSetting({ welcomeMessage: e.target.value });
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[color:var(--ad-line)]">
              <p className="text-[12.5px] text-[color:var(--ad-muted)] ad-tnum">
                마지막 초기화: {setting.lastResetAt ? new Date(setting.lastResetAt).toLocaleString('ko-KR') : '-'}
              </p>
              <Button variant="outline" onClick={resetChat} className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] border-0">
                <RefreshCw className="w-4 h-4" />
                지금 초기화
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 섹션 3: QR 코드 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)]">QR 코드</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {storeSlug ? (
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div ref={qrRef} className="p-4 bg-white rounded-[14px] shadow-[inset_0_0_0_1px_var(--ad-line)]">
                  <QRCodeCanvas value={chatUrl} size={200} level="M" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] text-[color:var(--ad-muted)] mb-2">고객은 아래 URL 또는 QR로 접속합니다:</p>
                  <p className="text-[12.5px] font-mono text-[color:var(--ad-ink-2)] bg-[color:var(--ad-bg-alt)] px-3 py-2 rounded-[10px] border border-[color:var(--ad-line)] break-all mb-3">
                    {chatUrl}
                  </p>
                  <Button onClick={downloadQr} className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40 border-0">
                    <Download className="w-4 h-4" />
                    QR 다운로드
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">매장 slug가 없어 QR을 생성할 수 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* 섹션 4: 게시글 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)] flex items-center justify-between">
              게시글
              {editingPost && (
                <button onClick={cancelEdit} className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> 편집 취소
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="제목 (선택)"
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
              />
              <textarea
                placeholder="내용"
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                rows={3}
                className="w-full py-2.5 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none resize-y"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[13px] text-[color:var(--ad-ink-2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPostPinned}
                    onChange={(e) => setNewPostPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-[color:var(--ad-line-strong)] accent-[#1d2022]"
                  />
                  상단 고정
                </label>
                <Button onClick={savePost} className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] border-0">
                  {editingPost ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingPost ? '수정' : '게시글 등록'}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-[color:var(--ad-line)]">
              {posts.length === 0 ? (
                <p className="text-[13px] text-[color:var(--ad-faint)] py-6 text-center">등록된 게시글이 없습니다.</p>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="p-3.5 rounded-[12px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {post.isPinned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                              <Pin className="w-3 h-3" /> 고정
                            </span>
                          )}
                          {post.title && (
                            <span className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">{post.title}</span>
                          )}
                        </div>
                        <p className="text-[13px] text-[color:var(--ad-ink-2)] whitespace-pre-wrap">{post.content}</p>
                        <p className="text-[11.5px] text-[color:var(--ad-faint)] mt-1 ad-tnum">
                          {new Date(post.createdAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePin(post)}
                          className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-bg)] rounded-[8px] transition-colors"
                          title={post.isPinned ? '고정 해제' : '상단 고정'}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEditPost(post)}
                          className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-link)] hover:bg-[color:var(--ad-bg)] rounded-[8px] transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePost(post.id)}
                          className="p-1.5 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] hover:bg-[color:var(--ad-bg)] rounded-[8px] transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* 섹션 5: 사장 직접 메시지 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)]">채팅방에 메시지 보내기</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="flex gap-2">
              <Input
                placeholder="사장님 명의로 메시지 송신 (500자 이내)"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    sendStoreMessage();
                  }
                }}
                maxLength={500}
              />
              <Button onClick={sendStoreMessage} className="ad-press inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] border-0 shrink-0 h-10">
                <Send className="w-4 h-4" />
                보내기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 섹션 6: 최근 메시지 모니터 */}
        <Card className="ad-card border-0">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-[14px] font-semibold text-[color:var(--ad-ink)] flex items-center justify-between">
              최근 메시지
              <button
                onClick={fetchAll}
                className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 새로고침
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-[13px] text-[color:var(--ad-faint)] py-6 text-center">메시지가 없습니다.</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`group flex items-start justify-between gap-2 px-2.5 py-2 rounded-[10px] hover:bg-[color:var(--ad-bg-alt)] ${
                      msg.senderType === 'STORE' ? 'bg-[color:var(--ad-bg)]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 text-[13px]">
                      <span className={`font-medium ${msg.senderType === 'STORE' ? 'font-semibold text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-ink)]'}`}>
                        {msg.nickname}
                      </span>
                      <span className="text-[color:var(--ad-faint)] text-[11.5px] ml-2 ad-tnum">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR')}
                      </span>
                      <p className="text-[color:var(--ad-ink-2)] mt-0.5 break-words">{msg.content}</p>
                    </div>
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
