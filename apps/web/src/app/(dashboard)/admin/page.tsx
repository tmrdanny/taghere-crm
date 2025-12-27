'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  Key,
  MessageSquare,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  XCircle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AlimTalkConfig {
  solapiApiKey: string | null;
  solapiApiSecret: string | null;
  pfId: string | null;
  templateIdPointsEarned: string | null;
  templateIdReviewRequest: string | null;
  enabled: boolean;
}

interface AlimTalkLog {
  id: string;
  phone: string;
  messageType: 'POINTS_EARNED' | 'NAVER_REVIEW_REQUEST';
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRY';
  retryCount: number;
  failReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface AlimTalkStats {
  period: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
  byType: { type: string; count: number }[];
}

export default function AdminPage() {
  // Config state
  const [config, setConfig] = useState<AlimTalkConfig>({
    solapiApiKey: null,
    solapiApiSecret: null,
    pfId: null,
    templateIdPointsEarned: null,
    templateIdReviewRequest: null,
    enabled: false,
  });

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [pfId, setPfId] = useState('');
  const [templatePointsEarned, setTemplatePointsEarned] = useState('');
  const [templateReviewRequest, setTemplateReviewRequest] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Logs & Stats
  const [logs, setLogs] = useState<AlimTalkLog[]>([]);
  const [stats, setStats] = useState<AlimTalkStats | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('token') || 'dev-token';
  };

  // Fetch config
  const fetchConfig = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/alimtalk/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setApiKey(data.solapiApiKey || '');
        setApiSecret(''); // Secret is masked
        setPfId(data.pfId || '');
        setTemplatePointsEarned(data.templateIdPointsEarned || '');
        setTemplateReviewRequest(data.templateIdReviewRequest || '');
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
      setError('설정을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/alimtalk/logs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/alimtalk/stats?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchLogs();
    fetchStats();
  }, [fetchConfig, fetchLogs, fetchStats]);

  // Save config
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getAuthToken();
      const body: Record<string, unknown> = {
        solapiApiKey: apiKey || null,
        pfId: pfId || null,
        templateIdPointsEarned: templatePointsEarned || null,
        templateIdReviewRequest: templateReviewRequest || null,
        enabled: config.enabled,
      };

      // Only include secret if changed (not masked value)
      if (apiSecret && apiSecret !== '********') {
        body.solapiApiSecret = apiSecret;
      }

      const res = await fetch(`${API_BASE}/api/alimtalk/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('설정 저장에 실패했습니다.');
      }

      setSuccess('설정이 저장되었습니다.');
      fetchConfig();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle enabled
  const handleToggle = async (enabled: boolean) => {
    setConfig((prev) => ({ ...prev, enabled }));

    try {
      const token = getAuthToken();
      await fetch(`${API_BASE}/api/alimtalk/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
    } catch (err) {
      console.error('Failed to toggle:', err);
    }
  };

  // Retry failed message
  const handleRetry = async (id: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/alimtalk/retry/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSuccess('재시도가 예약되었습니다.');
        fetchLogs();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError('재시도 요청 실패');
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format phone
  const formatPhone = (phone: string) => {
    if (phone.length === 11) {
      return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
    }
    return phone;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return <Badge variant="success">발송완료</Badge>;
      case 'FAILED':
        return <Badge variant="error">실패</Badge>;
      case 'PENDING':
        return <Badge variant="secondary">대기중</Badge>;
      case 'PROCESSING':
        return <Badge variant="secondary">처리중</Badge>;
      case 'RETRY':
        return <Badge variant="warning">재시도대기</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Get message type label
  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case 'POINTS_EARNED':
        return '포인트적립';
      case 'NAVER_REVIEW_REQUEST':
        return '리뷰요청';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-800" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">관리자 설정</h1>
        <p className="text-neutral-500 mt-1">
          SOLAPI 알림톡 발송 설정을 관리합니다.
        </p>
      </div>

      {/* Messages */}
      {success && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg">
          <CheckCircle className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* SOLAPI Credentials */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-neutral-600" />
                  <CardTitle className="text-lg">SOLAPI API 설정</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500">
                    {config.enabled ? '활성화됨' : '비활성화됨'}
                  </span>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={handleToggle}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  API Key
                </label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="SOLAPI API Key 입력"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  API Secret
                </label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder={config.solapiApiSecret ? '********' : 'SOLAPI API Secret 입력'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  변경하지 않으려면 비워두세요
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  카카오 채널 ID (pfId)
                </label>
                <Input
                  value={pfId}
                  onChange={(e) => setPfId(e.target.value)}
                  placeholder="@channel_id"
                />
              </div>
            </CardContent>
          </Card>

          {/* Template IDs */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">알림톡 템플릿 ID</CardTitle>
              </div>
              <p className="text-sm text-neutral-500 mt-1">
                SOLAPI에서 등록한 알림톡 템플릿 ID를 입력하세요.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  포인트 적립 알림 템플릿 ID
                </label>
                <Input
                  value={templatePointsEarned}
                  onChange={(e) => setTemplatePointsEarned(e.target.value)}
                  placeholder="KA01TP..."
                />
                <p className="text-xs text-neutral-500 mt-1">
                  변수: #{'{'}customerName{'}'}, #{'{'}points{'}'}, #{'{'}totalPoints{'}'}, #{'{'}storeName{'}'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-700 block mb-1">
                  네이버 리뷰 요청 템플릿 ID
                </label>
                <Input
                  value={templateReviewRequest}
                  onChange={(e) => setTemplateReviewRequest(e.target.value)}
                  placeholder="KA01TP..."
                />
                <p className="text-xs text-neutral-500 mt-1">
                  변수: #{'{'}customerName{'}'}, #{'{'}storeName{'}'}, #{'{'}reviewLink{'}'}, #{'{'}benefitText{'}'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-12"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Settings className="w-4 h-4 mr-2" />
            )}
            설정 저장하기
          </Button>
        </div>

        {/* Right: Stats & Logs */}
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">
                  최근 30일 발송 통계
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-neutral-900">{stats.total}</p>
                    <p className="text-xs text-neutral-500">전체</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
                    <p className="text-xs text-neutral-500">성공</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                    <p className="text-xs text-neutral-500">실패</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-brand-800">{stats.successRate}%</p>
                    <p className="text-xs text-neutral-500">성공률</p>
                  </div>
                </div>

                {stats.byType.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-neutral-100">
                    <p className="text-xs font-medium text-neutral-500 mb-2">유형별</p>
                    {stats.byType.map((t) => (
                      <div key={t.type} className="flex justify-between text-sm">
                        <span className="text-neutral-600">{getMessageTypeLabel(t.type)}</span>
                        <span className="font-medium">{t.count}건</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Logs */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-neutral-500">
                  최근 발송 로그
                </CardTitle>
                <button
                  onClick={() => { fetchLogs(); fetchStats(); }}
                  className="p-1 rounded hover:bg-neutral-100"
                >
                  <RefreshCw className="w-4 h-4 text-neutral-400" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-center text-neutral-400 py-8 text-sm">
                  발송 로그가 없습니다
                </p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-neutral-50 rounded-lg text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{formatPhone(log.phone)}</span>
                        {getStatusBadge(log.status)}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{getMessageTypeLabel(log.messageType)}</span>
                        <span>·</span>
                        <span>{formatTime(log.createdAt)}</span>
                      </div>
                      {log.failReason && (
                        <p className="text-xs text-red-500 mt-1">{log.failReason}</p>
                      )}
                      {log.status === 'FAILED' && (
                        <button
                          onClick={() => handleRetry(log.id)}
                          className="text-xs text-brand-800 hover:underline mt-1"
                        >
                          재시도
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
