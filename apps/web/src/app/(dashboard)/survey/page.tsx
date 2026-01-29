'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ClipboardList, GripVertical, Plus, Trash2, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface SurveyQuestion {
  id: string;
  type: 'DATE';
  label: string;
  description: string | null;
  enabled: boolean;
  required: boolean;
  order: number;
  dateConfig: { minDate?: string; maxDate?: string } | null;
  _count?: { answers: number };
}

const MAX_QUESTIONS = 10;

export default function SurveyPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);

  // New question input
  const [newLabel, setNewLabel] = useState('');

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const getToken = () => localStorage.getItem('token');

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/survey-questions`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data);
      }
    } catch (error) {
      console.error('Failed to fetch survey questions:', error);
      showToast('설문 질문을 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, showToast]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAddQuestion = async () => {
    if (!newLabel.trim()) {
      showToast('질문 이름을 입력해주세요.', 'error');
      return;
    }
    if (questions.length >= MAX_QUESTIONS) {
      showToast(`질문은 최대 ${MAX_QUESTIONS}개까지만 추가할 수 있습니다.`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/survey-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          type: 'DATE',
          label: newLabel.trim(),
          enabled: true,
          required: false,
        }),
      });

      if (res.ok) {
        setNewLabel('');
        await fetchQuestions();
        showToast('질문이 추가되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '질문 추가에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to add question:', error);
      showToast('질문 추가에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateQuestion = async (id: string, updates: Partial<SurveyQuestion>) => {
    // Optimistic update
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));

    try {
      const res = await fetch(`${apiUrl}/api/survey-questions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        await fetchQuestions(); // rollback
        showToast('수정에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to update question:', error);
      await fetchQuestions();
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('이 질문을 삭제하시겠습니까? 관련 응답 데이터도 함께 삭제됩니다.')) return;

    const prev = questions;
    setQuestions((qs) => qs.filter((q) => q.id !== id));

    try {
      const res = await fetch(`${apiUrl}/api/survey-questions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.ok) {
        showToast('질문이 삭제되었습니다.', 'success');
      } else {
        setQuestions(prev);
        showToast('삭제에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to delete question:', error);
      setQuestions(prev);
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDragLeave = () => setDragOverId(null);

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const draggedIndex = questions.findIndex((q) => q.id === draggedId);
    const targetIndex = questions.findIndex((q) => q.id === targetId);

    const newQuestions = [...questions];
    const [removed] = newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(targetIndex, 0, removed);

    const reordered = newQuestions.map((q, idx) => ({ ...q, order: idx }));
    setQuestions(reordered);
    setDraggedId(null);
    setDragOverId(null);

    try {
      await fetch(`${apiUrl}/api/survey-questions/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ ids: reordered.map((q) => q.id) }),
      });
    } catch (error) {
      console.error('Failed to reorder:', error);
      await fetchQuestions();
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">고객 설문</h1>
        <p className="text-neutral-500 mt-1">
          고객 등록 시 추가로 수집할 정보를 설정합니다. (예: 생년월일, 기념일)
        </p>
        <div className="mt-4 flex justify-center">
          <img
            src="/images/고객설문.png"
            alt="고객 설문 미리보기"
            className="max-w-[280px] w-full shadow-lg"
            style={{ borderRadius: 20 }}
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* 안내 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">💡 고객 설문 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">1</span>
                </div>
                <p>
                  질문을 추가하면 고객이 포인트/스탬프 적립 시 해당 질문이 표시됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">2</span>
                </div>
                <p>
                  현재 <strong>날짜 타입</strong> 질문을 지원합니다. (예: 생년월일, 결혼기념일)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">3</span>
                </div>
                <p>
                  수집된 응답은 <strong>고객 리스트</strong>에서 확인할 수 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 질문 관리 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">설문 질문 관리</CardTitle>
              </div>
              <span className="text-sm text-neutral-500">
                {questions.length} / {MAX_QUESTIONS}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객에게 보여줄 설문 질문을 관리합니다. 드래그하여 순서를 변경할 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 질문 목록 */}
            {questions.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">
                아직 설문 질문이 없습니다. 아래에서 추가해주세요.
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, question.id)}
                    onDragOver={(e) => handleDragOver(e, question.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, question.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-start gap-3 p-3 bg-neutral-50 rounded-lg transition-all
                      ${draggedId === question.id ? 'opacity-50' : ''}
                      ${dragOverId === question.id ? 'border-2 border-primary border-dashed' : ''}`}
                  >
                    <GripVertical className="w-4 h-4 text-neutral-400 cursor-grab active:cursor-grabbing shrink-0" />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-blue-600 font-medium">날짜</span>
                    </div>
                    <textarea
                      value={question.label}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((q) => (q.id === question.id ? { ...q, label: e.target.value } : q))
                        )
                      }
                      onBlur={(e) => {
                        const original = questions.find((q) => q.id === question.id);
                        if (original && original.label !== e.target.value) {
                          handleUpdateQuestion(question.id, { label: e.target.value });
                        }
                      }}
                      rows={2}
                      className="flex-1 bg-white rounded-md border border-input px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Switch
                      checked={question.enabled}
                      onCheckedChange={(checked) =>
                        handleUpdateQuestion(question.id, { enabled: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteQuestion(question.id)}
                      className="text-neutral-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* 새 질문 추가 */}
            <div className="flex items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 shrink-0 px-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-blue-600 font-medium">날짜</span>
              </div>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="예: 생년월일, 결혼기념일"
                disabled={questions.length >= MAX_QUESTIONS}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddQuestion();
                }}
              />
              <Button
                onClick={handleAddQuestion}
                disabled={isSaving || questions.length >= MAX_QUESTIONS}
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </div>
            {questions.length >= MAX_QUESTIONS && (
              <p className="text-sm text-amber-600">
                최대 {MAX_QUESTIONS}개까지만 추가할 수 있습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
