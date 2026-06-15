'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ClipboardList, GripVertical, Plus, Trash2, Calendar, Type, ListChecks, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type QuestionType = 'DATE' | 'TEXT' | 'CHOICE';

interface SurveyQuestion {
  id: string;
  type: QuestionType;
  label: string;
  description: string | null;
  enabled: boolean;
  required: boolean;
  order: number;
  dateConfig: { minDate?: string; maxDate?: string } | null;
  choiceOptions: string[] | null;
  _count?: { answers: number };
}

const MAX_QUESTIONS = 10;

const TYPE_CONFIG: Record<QuestionType, { label: string; icon: typeof Calendar; color: string; bgColor: string }> = {
  DATE: { label: '날짜', icon: Calendar, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  TEXT: { label: '텍스트', icon: Type, color: 'text-green-600', bgColor: 'bg-green-50' },
  CHOICE: { label: '선택', icon: ListChecks, color: 'text-purple-600', bgColor: 'bg-purple-50' },
};

export default function SurveyPage() {
  const apiUrl = API_BASE;
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);

  // New question input
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<QuestionType>('DATE');
  const [newChoiceOptions, setNewChoiceOptions] = useState<string[]>(['', '']);

  // Track original labels for dirty check on blur
  const originalLabelsRef = useRef<Record<string, string>>({});

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
        // Store original labels
        const labels: Record<string, string> = {};
        data.forEach((q: SurveyQuestion) => { labels[q.id] = q.label; });
        originalLabelsRef.current = labels;
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
    if (newType === 'CHOICE') {
      const validOptions = newChoiceOptions.filter((o) => o.trim());
      if (validOptions.length < 2) {
        showToast('선택형 질문은 최소 2개의 선택지를 입력해주세요.', 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const body: any = {
        type: newType,
        label: newLabel.trim(),
        enabled: true,
        required: false,
      };
      if (newType === 'CHOICE') {
        body.choiceOptions = newChoiceOptions.filter((o) => o.trim());
      }

      const res = await fetch(`${apiUrl}/api/survey-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setNewLabel('');
        setNewType('DATE');
        setNewChoiceOptions(['', '']);
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
      } else {
        // Update original label ref on successful save
        if (updates.label !== undefined) {
          originalLabelsRef.current[id] = updates.label;
        }
        showToast('저장되었습니다.', 'success');
      }
    } catch (error) {
      console.error('Failed to update question:', error);
      await fetchQuestions();
      showToast('수정에 실패했습니다.', 'error');
    }
  };

  const handleLabelBlur = (id: string, currentValue: string) => {
    const originalLabel = originalLabelsRef.current[id];
    if (originalLabel !== currentValue) {
      handleUpdateQuestion(id, { label: currentValue });
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
        delete originalLabelsRef.current[id];
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

  const handleUpdateChoiceOptions = async (id: string, options: string[]) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, choiceOptions: options } : q))
    );
    try {
      const res = await fetch(`${apiUrl}/api/survey-questions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ choiceOptions: options }),
      });
      if (!res.ok) {
        await fetchQuestions();
        showToast('선택지 수정에 실패했습니다.', 'error');
      }
    } catch {
      await fetchQuestions();
      showToast('선택지 수정에 실패했습니다.', 'error');
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

  const TypeBadge = ({ type }: { type: QuestionType }) => {
    const config = TYPE_CONFIG[type];
    const Icon = config.icon;
    return (
      <div className={`flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md ${config.bgColor}`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {ToastComponent}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Panel - Settings */}
        <div className="flex-1 lg:max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-neutral-900">고객 설문</h1>
            <p className="text-neutral-500 mt-1">
              고객 등록 시 추가로 수집할 정보를 설정합니다. (예: 생년월일, 기념일)
            </p>
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
                  <strong>날짜</strong>, <strong>텍스트</strong>, <strong>선택형</strong> 질문을 지원합니다.
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
                    className={`p-3 bg-neutral-50 rounded-lg transition-all
                      ${draggedId === question.id ? 'opacity-50' : ''}
                      ${dragOverId === question.id ? 'border-2 border-primary border-dashed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-neutral-400 cursor-grab active:cursor-grabbing shrink-0 mt-2" />
                      <TypeBadge type={question.type} />
                      <textarea
                        value={question.label}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((q) => (q.id === question.id ? { ...q, label: e.target.value } : q))
                          )
                        }
                        onBlur={(e) => handleLabelBlur(question.id, e.target.value)}
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
                    {/* CHOICE 타입 선택지 관리 */}
                    {question.type === 'CHOICE' && (
                      <ChoiceOptionsEditor
                        options={question.choiceOptions || []}
                        onChange={(options) => handleUpdateChoiceOptions(question.id, options)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 새 질문 추가 */}
            <div className="border-t border-neutral-200 pt-4 space-y-3">
              {/* 타입 선택 */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-600">타입:</span>
                {(Object.keys(TYPE_CONFIG) as QuestionType[]).map((type) => {
                  const config = TYPE_CONFIG[type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => setNewType(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        newType === type
                          ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {config.label}
                    </button>
                  );
                })}
              </div>

              {/* 질문 입력 */}
              <div className="flex items-start gap-2">
                <textarea
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={
                    newType === 'DATE' ? '예: 생년월일, 결혼기념일' :
                    newType === 'TEXT' ? '예: 좋아하는 음식, 알레르기' :
                    '예: 선호하는 음료'
                  }
                  disabled={questions.length >= MAX_QUESTIONS}
                  rows={2}
                  className="flex-1 bg-white rounded-md border border-input px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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

              {/* CHOICE 선택지 입력 */}
              {newType === 'CHOICE' && (
                <div className="ml-0 space-y-2">
                  <p className="text-xs text-neutral-500">선택지를 입력하세요 (최소 2개)</p>
                  {newChoiceOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300 shrink-0" />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const updated = [...newChoiceOptions];
                          updated[idx] = e.target.value;
                          setNewChoiceOptions(updated);
                        }}
                        placeholder={`선택지 ${idx + 1}`}
                        className="flex-1 bg-white rounded-md border border-input px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      {newChoiceOptions.length > 2 && (
                        <button
                          onClick={() => setNewChoiceOptions(newChoiceOptions.filter((_, i) => i !== idx))}
                          className="text-neutral-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {newChoiceOptions.length < 10 && (
                    <button
                      onClick={() => setNewChoiceOptions([...newChoiceOptions, ''])}
                      className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      선택지 추가
                    </button>
                  )}
                </div>
              )}
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

        {/* Right Panel - Preview Image */}
        <div className="hidden lg:block flex-none w-[300px] sticky top-8 self-start">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/images/고객설문.png"
              alt="고객 설문 미리보기"
              className="w-full shadow-lg"
              style={{ borderRadius: 20 }}
            />
            <p className="text-xs text-neutral-400">미리보기</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// CHOICE 선택지 편집 컴포넌트
function ChoiceOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const [localOptions, setLocalOptions] = useState<string[]>(options.length > 0 ? options : ['', '']);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const saveOptions = (updated: string[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const valid = updated.filter((o) => o.trim());
      if (valid.length >= 2) {
        onChange(valid);
      }
    }, 800);
  };

  return (
    <div className="ml-8 mt-2 space-y-1.5">
      <p className="text-xs text-neutral-400">선택지</p>
      {localOptions.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-300 shrink-0" />
          <input
            value={opt}
            onChange={(e) => {
              const updated = [...localOptions];
              updated[idx] = e.target.value;
              setLocalOptions(updated);
              saveOptions(updated);
            }}
            placeholder={`선택지 ${idx + 1}`}
            className="flex-1 bg-white rounded-md border border-input px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {localOptions.length > 2 && (
            <button
              onClick={() => {
                const updated = localOptions.filter((_, i) => i !== idx);
                setLocalOptions(updated);
                const valid = updated.filter((o) => o.trim());
                if (valid.length >= 2) onChange(valid);
              }}
              className="text-neutral-400 hover:text-red-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {localOptions.length < 10 && (
        <button
          onClick={() => setLocalOptions([...localOptions, ''])}
          className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          선택지 추가
        </button>
      )}
    </div>
  );
}
