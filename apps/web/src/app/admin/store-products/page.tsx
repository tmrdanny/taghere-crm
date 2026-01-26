'use client';

import { useEffect, useState } from 'react';

interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface StoreOrder {
  id: string;
  orderNumber: string;
  store: {
    id: string;
    name: string;
  };
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  totalAmount: number;
  status: string;
  paymentKey: string | null;
  paidAt: string | null;
  createdAt: string;
  items: {
    id: string;
    productName: string;
    price: number;
    quantity: number;
  }[];
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyFormData: ProductFormData = {
  name: '',
  description: '',
  price: '',
  imageUrl: '',
  isActive: true,
  sortOrder: 0,
};

export default function StoreProductsPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    if (activeTab === 'products') {
      fetchProducts();
    } else {
      fetchOrders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchProducts = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/store-products`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setToast({ message: '상품 목록을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrders = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/store-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setToast({ message: '주문 목록을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData(emptyFormData);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (product: StoreProduct) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      imageUrl: product.imageUrl || '',
      isActive: product.isActive,
      sortOrder: product.sortOrder,
    });
    setImagePreview(product.imageUrl || null);
    setShowModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 미리보기 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // 서버에 업로드
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsUploading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('image', file);

      const res = await fetch(`${apiUrl}/api/admin/store-products/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadFormData,
      });

      if (res.ok) {
        const data = await res.json();
        setFormData({ ...formData, imageUrl: data.imageUrl });
        setToast({ message: '이미지가 업로드되었습니다.', type: 'success' });
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      setToast({ message: error.message || '이미지 업로드에 실패했습니다.', type: 'error' });
      setImagePreview(formData.imageUrl || null);
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setFormData({ ...formData, imageUrl: '' });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      setToast({ message: '상품명과 가격을 입력해주세요.', type: 'error' });
      return;
    }

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsSaving(true);

    try {
      const url = editingId
        ? `${apiUrl}/api/admin/store-products/${editingId}`
        : `${apiUrl}/api/admin/store-products`;

      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price: parseInt(formData.price),
          imageUrl: formData.imageUrl || null,
          isActive: formData.isActive,
          sortOrder: formData.sortOrder,
        }),
      });

      if (res.ok) {
        setToast({
          message: editingId ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.',
          type: 'success',
        });
        setShowModal(false);
        fetchProducts();
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
    if (!confirm('정말 삭제하시겠습니까? 주문 내역이 있는 경우 비활성화 처리됩니다.')) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setDeletingId(id);

    try {
      const res = await fetch(`${apiUrl}/api/admin/store-products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setToast({
          message: data.deactivated ? '주문 내역이 있어 비활성화 처리되었습니다.' : '상품이 삭제되었습니다.',
          type: 'success'
        });
        fetchProducts();
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

  const toggleActive = async (product: StoreProduct) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/api/admin/store-products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !product.isActive }),
      });

      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id ? { ...p, isActive: !p.isActive } : p
          )
        );
        setToast({
          message: product.isActive ? '상품이 비활성화되었습니다.' : '상품이 활성화되었습니다.',
          type: 'success',
        });
      }
    } catch (error) {
      setToast({ message: '상태 변경에 실패했습니다.', type: 'error' });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            결제완료
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            결제대기
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            취소됨
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-700 text-neutral-400">
            {status}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
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
          <h1 className="text-2xl font-semibold text-neutral-900">스토어 상품 관리</h1>
          <p className="text-neutral-500 mt-1">스토어에서 판매할 상품을 관리합니다.</p>
        </div>
        {activeTab === 'products' && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 상품
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setActiveTab('products')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'products'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            상품 목록
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'orders'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            주문 내역
          </button>
        </nav>
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {products.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              등록된 상품이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="p-4 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded-lg border border-neutral-200"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              product.isActive
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-neutral-100 text-neutral-500'
                            }`}
                          >
                            {product.isActive ? '판매중' : '판매중지'}
                          </span>
                          <span className="text-xs text-neutral-400">정렬: {product.sortOrder}</span>
                        </div>
                        <h3 className="text-base font-medium text-neutral-900 truncate">
                          {product.name}
                        </h3>
                        <p className="text-lg font-semibold text-neutral-900 mt-0.5">
                          {formatPrice(product.price)}
                        </p>
                        {product.description && (
                          <p className="text-sm text-neutral-500 mt-1 line-clamp-2">
                            {product.description}
                          </p>
                        )}
                        <p className="text-xs text-neutral-400 mt-2">
                          등록: {new Date(product.createdAt).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(product)}
                        className={`p-2 rounded-lg transition-colors ${
                          product.isActive
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-neutral-400 hover:bg-neutral-100'
                        }`}
                        title={product.isActive ? '판매중지' : '판매시작'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {product.isActive ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          )}
                        </svg>
                      </button>
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="수정"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={deletingId === product.id}
                        className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="삭제"
                      >
                        {deletingId === product.id ? (
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
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              주문 내역이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="p-4 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(order.status)}
                        <span className="text-sm font-mono text-neutral-500">
                          #{order.orderNumber}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-neutral-900">
                          <span className="font-medium">구매자:</span> {order.customerName} ({order.customerPhone})
                        </p>
                        <p className="text-sm text-neutral-900">
                          <span className="font-medium">매장:</span> {order.store.name}
                        </p>
                        <p className="text-sm text-neutral-900">
                          <span className="font-medium">상품:</span>{' '}
                          {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                        </p>
                        <p className="text-base font-semibold text-neutral-900">
                          총 {formatPrice(order.totalAmount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                        <span>주문: {formatDate(order.createdAt)}</span>
                        {order.paidAt && <span>결제: {formatDate(order.paidAt)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              {editingId ? '상품 수정' : '새 상품 등록'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  상품명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="상품명을 입력하세요"
                  className="w-full h-10 px-3 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  가격 (원) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0"
                  className="w-full h-10 px-3 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  설명 (선택)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="상품 설명을 입력하세요"
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  상품 이미지 (선택)
                </label>

                {/* 이미지 미리보기 */}
                {imagePreview ? (
                  <div className="relative mb-3">
                    <img
                      src={imagePreview}
                      alt="상품 이미지 미리보기"
                      className="w-full h-40 object-cover rounded-lg border border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-neutral-300 rounded-lg cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition-colors mb-3">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-8 h-8 mb-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-neutral-500">
                        클릭하여 이미지 업로드
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        JPG, PNG, GIF, WebP (최대 5MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                )}

                {/* 업로드 중 표시 */}
                {isUploading && (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    이미지 업로드 중...
                  </div>
                )}

                {/* URL 직접 입력 옵션 */}
                <div className="mt-2">
                  <p className="text-xs text-neutral-500 mb-1">또는 URL 직접 입력</p>
                  <input
                    type="text"
                    value={formData.imageUrl}
                    onChange={(e) => {
                      setFormData({ ...formData, imageUrl: e.target.value });
                      setImagePreview(e.target.value || null);
                    }}
                    placeholder="https://example.com/image.jpg"
                    className="w-full h-9 px-3 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    정렬 순서
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full h-10 px-3 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-900"
                  />
                  <p className="text-xs text-neutral-500 mt-1">낮을수록 상단 표시</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    상태
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`w-full h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
                      formData.isActive
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-neutral-100 border border-neutral-200 text-neutral-500'
                    }`}
                  >
                    {formData.isActive ? '판매중' : '판매중지'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.name || !formData.price}
                className="flex-1 h-10 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </>
                ) : (
                  editingId ? '수정하기' : '등록하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
