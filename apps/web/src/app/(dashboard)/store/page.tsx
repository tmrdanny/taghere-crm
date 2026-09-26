'use client';

import { API_BASE } from '@/lib/api-config';
import { getStoreToken } from '@/lib/auth-token';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Loader2,
  CreditCard,
  CheckCircle2,
  Package,
  ImageIcon,
} from 'lucide-react';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { useToast } from '@/components/ui/toast';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
}

export default function StorePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: '',
    phone: '',
    email: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // TossPayments states
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [isPaymentReady, setIsPaymentReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [widgetKey, setWidgetKey] = useState<number>(0);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const agreementWidgetRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);

  const totalAmount = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const token = getStoreToken();
      const res = await fetch(`${API_BASE}/api/store-products`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to fetch products:', err);
      showToast('상품 목록을 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handle payment callback
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderIdParam = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');

    if (paymentKey && orderIdParam && amountParam) {
      const confirmPayment = async () => {
        setIsConfirmingPayment(true);
        try {
          const token = getStoreToken();
          const res = await fetch(`${API_BASE}/api/store-orders/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId: orderIdParam,
              amount: parseInt(amountParam),
            }),
          });

          if (res.ok) {
            setOrderSuccess(true);
            setCart([]);
            setShowPayment(false);
            showToast('주문이 완료되었습니다!', 'success');
          } else {
            const data = await res.json();
            showToast(data.error || '결제 확인에 실패했습니다.', 'error');
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
          showToast('결제 확인 중 오류가 발생했습니다.', 'error');
        } finally {
          setIsConfirmingPayment(false);
          router.replace('/store');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router, showToast]);

  // Initialize TossPayments widget when showing payment
  useEffect(() => {
    if (!showPayment || isInitializingRef.current || !TOSS_CLIENT_KEY || !orderId) {
      return;
    }

    const initAndRenderWidgets = async () => {
      isInitializingRef.current = true;

      try {
        let paymentMethodsEl = document.getElementById('store-payment-methods');
        let agreementEl = document.getElementById('store-agreement');

        let retries = 0;
        while ((!paymentMethodsEl || !agreementEl) && retries < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          paymentMethodsEl = document.getElementById('store-payment-methods');
          agreementEl = document.getElementById('store-agreement');
          retries++;
        }

        if (!paymentMethodsEl || !agreementEl) {
          console.error('TossPayments: DOM elements not found');
          isInitializingRef.current = false;
          return;
        }

        paymentMethodsEl.innerHTML = '';
        agreementEl.innerHTML = '';

        await new Promise(resolve => setTimeout(resolve, 100));

        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const customerKey = `TH_STORE_${uniqueId}`;
        const widgetsInstance = tossPayments.widgets({ customerKey });

        await widgetsInstance.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });

        paymentMethodsWidgetRef.current = await widgetsInstance.renderPaymentMethods({
          selector: '#store-payment-methods',
          variantKey: 'DEFAULT',
        });

        agreementWidgetRef.current = await widgetsInstance.renderAgreement({
          selector: '#store-agreement',
          variantKey: 'AGREEMENT',
        });

        setWidgets(widgetsInstance);
        setIsPaymentReady(true);
      } catch (error) {
        console.error('Failed to initialize TossPayments:', error);
        isInitializingRef.current = false;
        setIsPaymentReady(false);
      }
    };

    initAndRenderWidgets();
  }, [showPayment, widgetKey, orderId, totalAmount]);

  // Update widget amount when cart changes
  useEffect(() => {
    if (!widgets || !isPaymentReady) return;

    const updateAmount = async () => {
      try {
        await widgets.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });
      } catch (error) {
        console.error('Failed to update amount:', error);
      }
    };

    updateAmount();
  }, [widgets, totalAmount, isPaymentReady]);

  // Cleanup when payment modal closes
  useEffect(() => {
    if (!showPayment) {
      setWidgets(null);
      setIsPaymentReady(false);
      paymentMethodsWidgetRef.current = null;
      agreementWidgetRef.current = null;
      isInitializingRef.current = false;
      setOrderId(null);
    }
  }, [showPayment]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price) + '원';
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const proceedToPayment = async () => {
    if (cart.length === 0) {
      showToast('장바구니가 비어있습니다.', 'error');
      return;
    }

    if (!customerInfo.name || !customerInfo.phone) {
      showToast('구매자 정보를 입력해주세요.', 'error');
      return;
    }

    // Create order
    try {
      const token = getStoreToken();
      const res = await fetch(`${API_BASE}/api/store-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerName: customerInfo.name,
          customerPhone: customerInfo.phone,
          customerEmail: customerInfo.email || null,
          items: cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setOrderId(data.order.id);
        setShowPayment(true);
      } else {
        const data = await res.json();
        showToast(data.error || '주문 생성에 실패했습니다.', 'error');
      }
    } catch (err) {
      console.error('Failed to create order:', err);
      showToast('주문 생성 중 오류가 발생했습니다.', 'error');
    }
  };

  const handlePayment = async () => {
    if (!widgets || !isPaymentReady || !orderId) {
      showToast('결제 위젯이 준비되지 않았습니다.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      await widgets.requestPayment({
        orderId,
        orderName: cart.map(item => item.product.name).join(', ').substring(0, 100),
        successUrl: `${window.location.origin}/store?orderId=${orderId}&amount=${totalAmount}`,
        failUrl: `${window.location.origin}/store?paymentFailed=true`,
        customerEmail: customerInfo.email || '',
        customerName: customerInfo.name,
      });
    } catch (error: any) {
      if (error.code !== 'USER_CANCEL') {
        console.error('Payment error:', error);
        showToast('결제 처리 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const primaryBtn =
    'ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40';
  const secondaryBtn =
    'ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]';
  const inputCls =
    'h-10 rounded-[10px] border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none';
  const labelCls = 'mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]';

  if (isLoading || isConfirmingPayment) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ad-faint)]" />
        <p className="mt-4 text-[13px] text-[color:var(--ad-muted)]">
          {isConfirmingPayment ? '결제 처리 중...' : '상품 로딩 중...'}
        </p>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="mx-auto max-w-md py-12">
          <div className="ad-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
              <CheckCircle2 className="h-6 w-6 text-[color:var(--ad-ink-2)]" strokeWidth={1.7} />
            </div>
            <h2 className="mb-1.5 text-[17px] font-semibold text-[color:var(--ad-ink)]">
              주문 완료
            </h2>
            <p className="mb-6 text-[13px] leading-relaxed text-[color:var(--ad-muted)]">
              주문이 성공적으로 완료되었습니다.<br />
              담당자가 확인 후 연락드리겠습니다.
            </p>
            <button
              type="button"
              onClick={() => setOrderSuccess(false)}
              className={`${primaryBtn} w-full`}
            >
              계속 쇼핑하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">
          스토어
        </h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">태그히어 CRM에 필요한 장비를 구매하세요.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product List */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">상품 목록</h2>

          {products.length === 0 ? (
            <div className="ad-card py-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
              <p className="text-[13px] text-[color:var(--ad-faint)]">등록된 상품이 없습니다.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {products.map(product => (
                <div key={product.id} className="ad-card overflow-hidden transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(29,32,34,0.18)]">
                  {/* 상품 이미지 또는 플레이스홀더 */}
                  <div className="relative aspect-square bg-[color:var(--ad-bg)]">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-[color:var(--ad-line-strong)]" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="mb-1.5 line-clamp-2 text-[14px] font-semibold text-[color:var(--ad-ink)]">
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="mb-4 line-clamp-2 text-[12.5px] text-[color:var(--ad-muted)]">
                        {product.description}
                      </p>
                    ) : (
                      <div className="mb-4" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="ad-tnum text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ad-ink)]">
                        {formatPrice(product.price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                      >
                        <Plus className="h-4 w-4" />
                        담기
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart & Checkout */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="ad-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-[color:var(--ad-ink)]">
              <ShoppingBag className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              장바구니
              {cart.length > 0 && (
                <span className="ad-tnum ml-auto text-[12px] font-normal text-[color:var(--ad-muted)]">
                  {cart.length}개 상품
                </span>
              )}
            </h2>
            <div className="space-y-4">
              {cart.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[color:var(--ad-faint)]">
                  장바구니가 비어있습니다.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {cart.map(item => (
                      <div
                        key={item.product.id}
                        className="flex items-start gap-3 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-3"
                      >
                        {/* 장바구니 아이템 이미지 또는 플레이스홀더 */}
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="h-12 w-12 flex-shrink-0 rounded-[8px] object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--ad-bg)]">
                            <ImageIcon className="h-5 w-5 text-[color:var(--ad-faint)]" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[color:var(--ad-ink)]">
                            {item.product.name}
                          </p>
                          <p className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                            {formatPrice(item.product.price)}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(item.product.id, -1)}
                              className="ad-press rounded-[8px] bg-white p-1.5 text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="ad-tnum w-6 text-center text-[13px] font-medium text-[color:var(--ad-ink)]">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.product.id, 1)}
                              className="ad-press rounded-[8px] bg-white p-1.5 text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="ml-auto rounded-[8px] p-1.5 text-[color:var(--ad-faint)] transition-colors hover:bg-[#fff2f5] hover:text-[color:var(--ad-neg)]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[color:var(--ad-line)] pt-4">
                    <div className="flex items-center justify-between rounded-[12px] bg-[color:var(--ad-bg-alt)] p-3">
                      <span className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">총 결제금액</span>
                      <span className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {formatPrice(totalAmount)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Customer Info */}
          {cart.length > 0 && (
            <div className="ad-card p-5">
              <h2 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">구매자 정보</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>
                    이름 <span className="text-[color:var(--ad-neg)]">*</span>
                  </label>
                  <Input
                    value={customerInfo.name}
                    onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    placeholder="홍길동"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    연락처 <span className="text-[color:var(--ad-neg)]">*</span>
                  </label>
                  <Input
                    value={customerInfo.phone}
                    onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    placeholder="01012345678"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    이메일 (선택)
                  </label>
                  <Input
                    type="email"
                    value={customerInfo.email}
                    onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    placeholder="example@email.com"
                    className={inputCls}
                  />
                </div>
                <button
                  type="button"
                  className={`${primaryBtn} mt-2 w-full`}
                  onClick={proceedToPayment}
                  disabled={!customerInfo.name || !customerInfo.phone}
                >
                  <CreditCard className="h-4 w-4" />
                  결제하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[20px] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(29,32,34,0.35)]">
            <h3 className="mb-4 text-[17px] font-semibold text-[color:var(--ad-ink)]">
              결제하기
            </h3>

            <div className="mb-4 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--ad-muted)]">결제 금액</span>
                <span className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {formatPrice(totalAmount)}
                </span>
              </div>
            </div>

            <div key={`store-widget-${widgetKey}`}>
              <div id="store-payment-methods" className="mb-3" />
              <div id="store-agreement" className="mb-3" />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className={`${secondaryBtn} flex-1`}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handlePayment}
                disabled={!isPaymentReady || isProcessing}
                className={`${primaryBtn} flex-1`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    결제 중...
                  </>
                ) : !isPaymentReady ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    준비 중...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    결제하기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
