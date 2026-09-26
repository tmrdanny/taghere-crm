'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  DATE: { label: '날짜', icon: Calendar, color: 'text-[color:var(--ad-muted)]', bgColor: 'bg-[color:var(--ad-bg)]' },
  TEXT: { label: '텍스트', icon: Type, color: 'text-[color:var(--ad-muted)]', bgColor: 'bg-[color:var(--ad-bg)]' },
  CHOICE: { label: '선택', icon: ListChecks, color: 'text-[color:var(--ad-muted)]', bgColor: 'bg-[color:var(--ad-bg)]' },
};

export default function SurveyPage() {
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
      const res = await fetch(`${API_BASE}/api/survey-questions`, {
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
  }, [showToast]);

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

      const res = await fetch(`${API_BASE}/api/survey-questions`, {
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
      const res = await fetch(`${API_BASE}/api/survey-questions/${id}`, {
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
      const res = await fetch(`${API_BASE}/api/survey-questions/${id}`, {
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
      const res = await fetch(`${API_BASE}/api/survey-questions/${id}`, {
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
      await fetch(`${API_BASE}/api/survey-questions/reorder`, {
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
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      </div>
    );
  }

  const TypeBadge = ({ type }: { type: QuestionType }) => {
    const config = TYPE_CONFIG[type];
    const Icon = config.icon;
    return (
      <div className={`mt-1.5 inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 ${config.bgColor}`}>
        <Icon className={`w-3 h-3 ${config.color}`} strokeWidth={1.8} />
        <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Panel - Settings */}
        <div className="flex-1 lg:max-w-3xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 설문</h1>
            <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
              고객 등록 시 추가로 수집할 정보를 설정합니다. (예: 생년월일, 기념일)
            </p>
          </div>

          <div className="space-y-4">
        {/* 안내 카드 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">고객 설문 안내</h3>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-3 text-[13px] text-[color:var(--ad-ink-2)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">1</span>
                </div>
                <p>
                  질문을 추가하면 고객이 포인트/스탬프 적립 시 해당 질문이 표시됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">2</span>
                </div>
                <p>
                  <strong>날짜</strong>, <strong>텍스트</strong>, <strong>선택형</strong> 질문을 지원합니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">3</span>
                </div>
                <p>
                  수집된 응답은 <strong>고객 리스트</strong>에서 확인할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 질문 관리 카드 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">설문 질문 관리</h3>
              </div>
              <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                {questions.length} / {MAX_QUESTIONS}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              고객에게 보여줄 설문 질문을 관리합니다. 드래그하여 순서를 변경할 수 있습니다.
            </p>
          </div>
          <div className="space-y-4 p-5">
            {/* 질문 목록 */}
            {questions.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[color:var(--ad-faint)]">
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
                    className={`rounded-[12px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-3 transition-all
                      ${draggedId === question.id ? 'opacity-50' : ''}
                      ${dragOverId === question.id ? 'border-2 border-dashed border-[color:var(--ad-ink)]' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-[color:var(--ad-faint)] cursor-grab active:cursor-grabbing shrink-0 mt-2" />
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
                        className="flex-1 resize-none rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none"
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
                        className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] shrink-0"
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
            <div className="space-y-3 border-t border-[color:var(--ad-line)] pt-4">
              {/* 타입 선택 */}
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-[color:var(--ad-muted)]">타입:</span>
                {(Object.keys(TYPE_CONFIG) as QuestionType[]).map((type) => {
                  const config = TYPE_CONFIG[type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => setNewType(type)}
                      className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                        newType === type
                          ? 'bg-[color:var(--ad-ink)] text-white'
                          : 'bg-white text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
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
                  className="flex-1 resize-none rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none disabled:opacity-50"
                />
                <Button
                  onClick={handleAddQuestion}
                  disabled={isSaving || questions.length >= MAX_QUESTIONS}
                  variant="outline"
                  className="ad-press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[12px] border-0 bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                  추가
                </Button>
              </div>

              {/* CHOICE 선택지 입력 */}
              {newType === 'CHOICE' && (
                <div className="ml-0 space-y-2">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">선택지를 입력하세요 (최소 2개)</p>
                  {newChoiceOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-[color:var(--ad-line-strong)] shrink-0" />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const updated = [...newChoiceOptions];
                          updated[idx] = e.target.value;
                          setNewChoiceOptions(updated);
                        }}
                        placeholder={`선택지 ${idx + 1}`}
                        className="h-9 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none"
                      />
                      {newChoiceOptions.length > 2 && (
                        <button
                          onClick={() => setNewChoiceOptions(newChoiceOptions.filter((_, i) => i !== idx))}
                          className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {newChoiceOptions.length < 10 && (
                    <button
                      onClick={() => setNewChoiceOptions([...newChoiceOptions, ''])}
                      className="flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                    >
                      <Plus className="w-3 h-3" />
                      선택지 추가
                    </button>
                  )}
                </div>
              )}
            </div>

            {questions.length >= MAX_QUESTIONS && (
              <p className="text-[12.5px] text-[color:var(--ad-muted)]">
                최대 {MAX_QUESTIONS}개까지만 추가할 수 있습니다.
              </p>
            )}
          </div>
        </div>
          </div>
        </div>

        {/* Right Panel - Preview Image */}
        <div className="hidden lg:block flex-none w-[300px] sticky top-8 self-start">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/images/고객설문.png"
              alt="고객 설문 미리보기"
              className="w-full shadow-[0_24px_60px_-20px_rgba(29,32,34,0.3)]"
              style={{ borderRadius: 20 }}
            />
            <p className="text-[12px] text-[color:var(--ad-faint)]">미리보기</p>
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
      <p className="text-[12px] text-[color:var(--ad-faint)]">선택지</p>
      {localOptions.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-[color:var(--ad-line-strong)] shrink-0" />
          <input
            value={opt}
            onChange={(e) => {
              const updated = [...localOptions];
              updated[idx] = e.target.value;
              setLocalOptions(updated);
              saveOptions(updated);
            }}
            placeholder={`선택지 ${idx + 1}`}
            className="h-8 flex-1 rounded-[8px] border border-[color:var(--ad-line-strong)] bg-white px-2.5 text-[12.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none"
          />
          {localOptions.length > 2 && (
            <button
              onClick={() => {
                const updated = localOptions.filter((_, i) => i !== idx);
                setLocalOptions(updated);
                const valid = updated.filter((o) => o.trim());
                if (valid.length >= 2) onChange(valid);
              }}
              className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {localOptions.length < 10 && (
        <button
          onClick={() => setLocalOptions([...localOptions, ''])}
          className="flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
        >
          <Plus className="w-3 h-3" />
          선택지 추가
        </button>
      )}
    </div>
  );
}
