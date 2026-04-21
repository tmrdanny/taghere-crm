'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Send, Pin, MessageSquare, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type AuthMode = 'ANONYMOUS' | 'KAKAO';

interface ChatMessage {
  id: string;
  senderType: 'USER' | 'STORE' | 'SYSTEM';
  nickname: string;
  content: string;
  createdAt: string;
}

interface ChatPost {
  id: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
  createdAt: string;
}

interface RoomInfo {
  enabled: boolean;
  authMode: AuthMode;
  welcomeMessage?: string | null;
  storeName?: string;
}

function sessionKey(slug: string) {
  return `chat_session_${slug}`;
}

export default function CustomerChatPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [posts, setPosts] = useState<ChatPost[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/public/chat/${storeSlug}/info`);
      if (res.ok) {
        const data = await res.json();
        setRoomInfo(data);
      } else if (res.status === 404) {
        setError('매장을 찾을 수 없습니다.');
      } else {
        setError('채팅방 정보를 불러올 수 없습니다.');
      }
    } catch {
      setError('네트워크 오류');
    } finally {
      setIsLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const joinRoom = useCallback(async () => {
    if (!roomInfo?.enabled) return;

    const stored = typeof window !== 'undefined' ? localStorage.getItem(sessionKey(storeSlug)) : null;

    const body: any = {};
    if (stored) body.sessionId = stored;

    if (roomInfo.authMode === 'KAKAO') {
      // 카카오 모드: 기존 storage의 kakaoId와 nickname을 찾아 전달
      const kakaoId = typeof window !== 'undefined' ? localStorage.getItem('taghere_kakao_id') : null;
      const kakaoNickname = typeof window !== 'undefined' ? localStorage.getItem('taghere_kakao_nickname') : null;
      if (!kakaoId || !kakaoNickname) {
        setError('카카오 로그인이 필요한 채팅방입니다. 먼저 멤버십 페이지에서 카카오 인증을 완료해주세요.');
        return;
      }
      body.kakaoId = kakaoId;
      body.kakaoNickname = kakaoNickname;
    }

    try {
      const res = await fetch(`${API_BASE}/api/public/chat/${storeSlug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || '입장 실패');
        return;
      }
      const data = await res.json();
      localStorage.setItem(sessionKey(storeSlug), data.sessionId);
      setNickname(data.nickname);

      // 메시지/게시글 초기 로드
      const [msgRes, postRes] = await Promise.all([
        fetch(`${API_BASE}/api/public/chat/${storeSlug}/messages`),
        fetch(`${API_BASE}/api/public/chat/${storeSlug}/posts`),
      ]);
      if (msgRes.ok) {
        const d = await msgRes.json();
        setMessages(d.messages || []);
      }
      if (postRes.ok) {
        const d = await postRes.json();
        setPosts(d.posts || []);
      }

      // Socket 연결
      const socket = io(`${API_BASE}/chat`, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join', { storeSlug, sessionId: data.sessionId });
      });
      socket.on('joined', () => {
        setJoined(true);
      });
      socket.on('message:new', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
      });
      socket.on('message:delete', ({ id }: { id: string }) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      });
      socket.on('post:new', (post: ChatPost) => {
        setPosts((prev) => [post, ...prev]);
      });
      socket.on('post:update', (post: ChatPost) => {
        setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...post } : p)));
      });
      socket.on('post:delete', ({ id }: { id: string }) => {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      });
      socket.on('participants:count', ({ count }: { count: number }) => {
        setParticipantCount(count);
      });
      socket.on('room:reset', ({ welcomeMessage }: { welcomeMessage: string | null }) => {
        setMessages([]);
        if (welcomeMessage) {
          setMessages([
            {
              id: `system-${Date.now()}`,
              senderType: 'SYSTEM',
              nickname: '공지',
              content: welcomeMessage,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      });
      socket.on('error', (err: { message: string }) => {
        console.error('[Chat] socket error:', err);
      });
    } catch (err) {
      console.error(err);
      setError('연결 실패');
    }
  }, [roomInfo, storeSlug]);

  useEffect(() => {
    if (roomInfo?.enabled && !joined && !error) {
      joinRoom();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomInfo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('message:send', { content: input.trim() });
    setInput('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="bg-white rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!roomInfo?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="bg-white rounded-2xl p-8 max-w-sm text-center shadow-sm">
          <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-700 font-medium mb-1">채팅방이 운영 중이지 않습니다</p>
          <p className="text-sm text-neutral-500">매장 사장님에게 문의해주세요.</p>
        </div>
      </div>
    );
  }

  const pinnedPosts = posts.filter((p) => p.isPinned);

  return (
    <div className="h-[100dvh] flex flex-col bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-5 h-5 text-brand-800 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900 truncate">{roomInfo.storeName || '채팅방'}</p>
            <p className="text-xs text-neutral-500">
              {participantCount > 0 ? `${participantCount}명 접속 중` : '입장 중...'} · {nickname}
            </p>
          </div>
        </div>
      </header>

      {/* Pinned posts */}
      {pinnedPosts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 space-y-1.5 max-h-[30%] overflow-y-auto">
          {pinnedPosts.map((post) => (
            <div key={post.id} className="flex items-start gap-2">
              <Pin className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {post.title && <p className="font-medium text-amber-900 text-sm">{post.title}</p>}
                <p className="text-sm text-amber-800 whitespace-pre-wrap break-words">{post.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {posts
          .filter((p) => !p.isPinned)
          .slice(0, 5)
          .map((post) => (
            <div key={post.id} className="bg-white border border-neutral-200 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-brand-800 bg-brand-50 px-2 py-0.5 rounded">공지</span>
                {post.title && <span className="font-medium text-neutral-900 text-sm">{post.title}</span>}
              </div>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap break-words">{post.content}</p>
            </div>
          ))}

        {messages.map((msg) => {
          const isStore = msg.senderType === 'STORE';
          const isSystem = msg.senderType === 'SYSTEM';
          const isMine = msg.nickname === nickname && !isStore && !isSystem;

          if (isSystem) {
            return (
              <div key={msg.id} className="text-center py-2">
                <p className="inline-block text-xs text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full">
                  {msg.content}
                </p>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
            >
              {!isMine && (
                <p className={`text-xs mb-0.5 ${isStore ? 'text-amber-700 font-semibold' : 'text-neutral-500'}`}>
                  {msg.nickname}
                </p>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words ${
                  isMine
                    ? 'bg-brand-800 text-white'
                    : isStore
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-white text-neutral-900 border border-neutral-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-neutral-200 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
            placeholder={joined ? '메시지 입력' : '입장 중...'}
            disabled={!joined}
            maxLength={500}
            className="flex-1 px-4 py-2.5 rounded-full border border-neutral-300 text-sm focus:outline-none focus:border-brand-800 disabled:bg-neutral-100"
          />
          <button
            onClick={sendMessage}
            disabled={!joined || !input.trim()}
            className="w-10 h-10 rounded-full bg-brand-800 text-white flex items-center justify-center disabled:bg-neutral-300 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
