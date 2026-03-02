'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Link2, Plus, Trash2, Copy, QrCode, ListPlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

export default function TableLinkPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [customerTitle, setCustomerTitle] = useState('');
  const [customerSubtitle, setCustomerSubtitle] = useState('');
  const [tables, setTables] = useState<TableEntry[]>([]);
  const [customerPageUrl, setCustomerPageUrl] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');

  // Bulk add fields
  const [bulkStartNumber, setBulkStartNumber] = useState('');
  const [bulkEndNumber, setBulkEndNumber] = useState('');
  const [bulkUrlTemplate, setBulkUrlTemplate] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/table-link-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setEnabled(data.enabled);
          setCustomerTitle(data.customerTitle || '');
          setCustomerSubtitle(data.customerSubtitle || '');
          setTables(data.tables || []);
          setCustomerPageUrl(data.customerPageUrl);
          setStoreName(data.storeName || '');
        }
      } catch (error) {
        console.error('Failed to fetch table link settings:', error);
        showToast('설정을 불러오는데 실패했습니다.', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [apiUrl]);

  const handleSave = async () => {
    // Validate
    for (const t of tables) {
      if (!t.tableNumber.trim() || !t.url.trim()) {
        showToast('테이블 번호와 URL은 필수입니다.', 'error');
        return;
      }
      try {
        new URL(t.url);
      } catch {
        showToast(`잘못된 URL 형식입니다: ${t.url}`, 'error');
        return;
      }
    }

    const numbers = tables.map(t => t.tableNumber);
    if (new Set(numbers).size !== numbers.length) {
      showToast('중복된 테이블 번호가 있습니다.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/table-link-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled,
          tables,
          customerTitle: customerTitle || null,
          customerSubtitle: customerSubtitle || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkStartNumber || !bulkEndNumber || !bulkUrlTemplate) {
      showToast('시작 번호, 끝 번호, URL 템플릿을 모두 입력해주세요.', 'error');
      return;
    }

    setIsBulkAdding(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/table-link-settings/bulk-add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startNumber: bulkStartNumber,
          endNumber: bulkEndNumber,
          urlTemplate: bulkUrlTemplate,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
        setBulkStartNumber('');
        setBulkEndNumber('');
        setBulkUrlTemplate('');
        showToast(`${data.addedCount}개 테이블이 추가되었습니다.${data.skippedCount > 0 ? ` (중복 ${data.skippedCount}개 건너뜀)` : ''}`, 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '일괄 추가 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to bulk add:', error);
      showToast('일괄 추가 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsBulkAdding(false);
    }
  };

  const handleAddTable = () => {
    if (tables.length >= 100) {
      showToast('테이블은 최대 100개까지 등록할 수 있습니다.', 'error');
      return;
    }
    setTables([...tables, { tableNumber: '', url: '' }]);
  };

  const handleRemoveTable = (index: number) => {
    setTables(tables.filter((_, i) => i !== index));
  };

  const handleTableChange = (index: number, field: keyof TableEntry, value: string) => {
    const updated = [...tables];
    updated[index] = { ...updated[index], [field]: value };
    setTables(updated);
  };

  const handleCopyUrl = () => {
    if (customerPageUrl) {
      navigator.clipboard.writeText(customerPageUrl);
      showToast('URL이 복사되었습니다.', 'success');
    }
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

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">테이블 링크</h1>
        <p className="text-neutral-500 mt-1">
          고객이 QR코드로 접속하여 테이블 번호를 입력하면 해당 주문 페이지로 이동합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 활성화 토글 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">테이블 링크 설정</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">서비스 활성화</p>
                <p className="text-sm text-neutral-500 mt-1">
                  활성화하면 고객이 테이블 번호를 입력하여 주문 페이지로 이동할 수 있습니다.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* 고객 페이지 URL */}
        {customerPageUrl && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-neutral-600" />
                <CardTitle className="text-lg">고객 페이지 URL</CardTitle>
              </div>
              <p className="text-sm text-neutral-500 mt-1">
                이 URL로 QR코드를 생성하여 매장에 부착하세요.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  value={customerPageUrl}
                  readOnly
                  className="flex-1 bg-neutral-50 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                  <Copy className="w-4 h-4 mr-1" />
                  복사
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 고객 페이지 안내 문구 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">고객 페이지 안내 문구</CardTitle>
            <p className="text-sm text-neutral-500 mt-1">
              고객이 테이블 번호를 입력하는 페이지에 표시할 안내 문구입니다. 비워두면 기본 문구가 사용됩니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">제목</label>
              <Input
                value={customerTitle}
                onChange={(e) => setCustomerTitle(e.target.value)}
                placeholder={`${storeName || '매장'} 모바일 주문`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">부제목</label>
              <Input
                value={customerSubtitle}
                onChange={(e) => setCustomerSubtitle(e.target.value)}
                placeholder="테이블 번호를 입력해주세요"
              />
            </div>
          </CardContent>
        </Card>

        {/* 일괄 추가 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <ListPlus className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">테이블 일괄 추가</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              테이블 번호 범위와 URL 패턴을 지정하여 한 번에 추가합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">시작 번호</label>
                <Input
                  type="number"
                  value={bulkStartNumber}
                  onChange={(e) => setBulkStartNumber(e.target.value)}
                  placeholder="1"
                  min="1"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700">끝 번호</label>
                <Input
                  type="number"
                  value={bulkEndNumber}
                  onChange={(e) => setBulkEndNumber(e.target.value)}
                  placeholder="50"
                  min="1"
                  max="100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-700">URL 템플릿</label>
              <Input
                value={bulkUrlTemplate}
                onChange={(e) => setBulkUrlTemplate(e.target.value)}
                placeholder="https://example.com/order?table={number}"
              />
              <p className="text-xs text-neutral-400">
                <code className="bg-neutral-100 px-1 py-0.5 rounded">{'{number}'}</code>를 사용하면 테이블 번호로 자동 치환됩니다.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleBulkAdd}
                disabled={isBulkAdding || !bulkStartNumber || !bulkEndNumber || !bulkUrlTemplate}
                variant="outline"
              >
                {isBulkAdding ? '추가 중...' : '일괄 추가'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 테이블 목록 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">테이블 목록</CardTitle>
                <p className="text-sm text-neutral-500 mt-1">
                  {tables.length}개 테이블 등록됨 (최대 100개)
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleAddTable}>
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tables.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">
                <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">등록된 테이블이 없습니다.</p>
                <p className="text-xs mt-1">위의 일괄 추가 또는 추가 버튼을 사용해 테이블을 등록하세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-[80px_1fr_40px] gap-2 px-1">
                  <span className="text-xs font-medium text-neutral-500">테이블 번호</span>
                  <span className="text-xs font-medium text-neutral-500">URL</span>
                  <span></span>
                </div>

                {tables.map((table, index) => (
                  <div key={index} className="grid grid-cols-[80px_1fr_40px] gap-2 items-center">
                    <Input
                      value={table.tableNumber}
                      onChange={(e) => handleTableChange(index, 'tableNumber', e.target.value)}
                      placeholder="번호"
                      className="text-center text-sm"
                    />
                    <Input
                      value={table.url}
                      onChange={(e) => handleTableChange(index, 'url', e.target.value)}
                      placeholder="https://..."
                      className="text-sm"
                    />
                    <button
                      onClick={() => handleRemoveTable(index)}
                      className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 저장 버튼 */}
        <div className="flex justify-end pb-8">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
