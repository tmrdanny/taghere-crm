'use client';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
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
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <p className="text-neutral-500">로딩 중...</p>
      </div>
    );
  }

  if (!setting) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <p className="text-neutral-500">설정을 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          테이블 채팅
        </h1>
        <p className="text-neutral-500 mt-1">
          매장 내 QR로 접속한 손님들이 실시간으로 소통할 수 있는 채팅방을 운영합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 섹션 1: 기본 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">기본 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">채팅방 활성화</p>
                <p className="text-sm text-neutral-500">활성화하면 고객이 QR로 채팅방에 접속할 수 있습니다.</p>
              </div>
              <Switch
                checked={setting.enabled}
                onCheckedChange={(v) => updateSetting({ enabled: v })}
                disabled={isSaving}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">유저 식별 방식</p>
              <div className="grid grid-cols-2 gap-2">
                {(['ANONYMOUS', 'KAKAO'] as AuthMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateSetting({ authMode: mode })}
                    disabled={isSaving}
                    className={`py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      setting.authMode === mode
                        ? 'border-brand-800 bg-brand-50 text-brand-800'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {mode === 'ANONYMOUS' ? '익명 (자동 닉네임)' : '카카오 로그인'}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 섹션 2: 초기화 스케줄 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">채팅방 자동 초기화</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">초기화 주기 (일)</label>
                <select
                  value={setting.resetIntervalDays}
                  onChange={(e) => updateSetting({ resetIntervalDays: parseInt(e.target.value, 10) })}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {d}일마다
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1.5">초기화 시각 (KST)</label>
                <select
                  value={setting.resetHourKst}
                  onChange={(e) => updateSetting({ resetHourKst: parseInt(e.target.value, 10) })}
                  disabled={isSaving}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
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
              <label className="text-sm font-medium text-neutral-700 block mb-1.5">환영 메시지 (초기화 직후 표시)</label>
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

            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <p className="text-sm text-neutral-500">
                마지막 초기화: {setting.lastResetAt ? new Date(setting.lastResetAt).toLocaleString('ko-KR') : '-'}
              </p>
              <Button variant="outline" onClick={resetChat} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                지금 초기화
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 섹션 3: QR 코드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">QR 코드</CardTitle>
          </CardHeader>
          <CardContent>
            {storeSlug ? (
              <div className="flex items-start gap-6">
                <div ref={qrRef} className="p-4 bg-white border border-neutral-200 rounded-xl">
                  <QRCodeCanvas value={chatUrl} size={200} level="M" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-neutral-600 mb-2">고객은 아래 URL 또는 QR로 접속합니다:</p>
                  <p className="text-sm font-mono bg-neutral-50 px-3 py-2 rounded border border-neutral-200 break-all mb-3">
                    {chatUrl}
                  </p>
                  <Button onClick={downloadQr} className="gap-2">
                    <Download className="w-4 h-4" />
                    QR 다운로드
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">매장 slug가 없어 QR을 생성할 수 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {/* 섹션 4: 게시글 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              게시글
              {editingPost && (
                <button onClick={cancelEdit} className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
                  <X className="w-3 h-3" /> 편집 취소
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm resize-y"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPostPinned}
                    onChange={(e) => setNewPostPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-300"
                  />
                  상단 고정
                </label>
                <Button onClick={savePost} className="gap-2">
                  {editingPost ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingPost ? '수정' : '게시글 등록'}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-100">
              {posts.length === 0 ? (
                <p className="text-sm text-neutral-400 py-4 text-center">등록된 게시글이 없습니다.</p>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="p-3 border border-neutral-200 rounded-lg bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {post.isPinned && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                              <Pin className="w-3 h-3" /> 고정
                            </span>
                          )}
                          {post.title && (
                            <span className="font-medium text-neutral-900 text-sm">{post.title}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 whitespace-pre-wrap">{post.content}</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          {new Date(post.createdAt).toLocaleString('ko-KR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePin(post)}
                          className="p-1.5 text-neutral-400 hover:text-amber-600 rounded transition-colors"
                          title={post.isPinned ? '고정 해제' : '상단 고정'}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEditPost(post)}
                          className="p-1.5 text-neutral-400 hover:text-brand-800 rounded transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePost(post.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-500 rounded transition-colors"
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">채팅방에 메시지 보내기</CardTitle>
          </CardHeader>
          <CardContent>
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
              <Button onClick={sendStoreMessage} className="gap-2 shrink-0">
                <Send className="w-4 h-4" />
                보내기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 섹션 6: 최근 메시지 모니터 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              최근 메시지
              <button
                onClick={fetchAll}
                className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 새로고침
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-sm text-neutral-400 py-4 text-center">메시지가 없습니다.</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`group flex items-start justify-between gap-2 p-2 rounded hover:bg-neutral-50 ${
                      msg.senderType === 'STORE' ? 'bg-amber-50/50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0 text-sm">
                      <span className={`font-medium ${msg.senderType === 'STORE' ? 'text-amber-800' : 'text-neutral-900'}`}>
                        {msg.nickname}
                      </span>
                      <span className="text-neutral-400 text-xs ml-2">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR')}
                      </span>
                      <p className="text-neutral-700 mt-0.5 break-words">{msg.content}</p>
                    </div>
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-500 transition-opacity"
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
