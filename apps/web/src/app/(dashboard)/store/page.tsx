'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
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

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('token') || '';
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const token = getAuthToken();
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
          const token = getAuthToken();
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
      const token = getAuthToken();
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

  if (isLoading || isConfirmingPayment) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        <p className="mt-4 text-sm text-neutral-500">
          {isConfirmingPayment ? '결제 처리 중...' : '상품 로딩 중...'}
        </p>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <div className="max-w-md mx-auto py-12">
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
                주문 완료
              </h2>
              <p className="text-neutral-600 mb-6">
                주문이 성공적으로 완료되었습니다.<br />
                담당자가 확인 후 연락드리겠습니다.
              </p>
              <Button
                onClick={() => setOrderSuccess(false)}
                className="w-full"
              >
                계속 쇼핑하기
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {ToastComponent}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6" />
          스토어
        </h1>
        <p className="text-neutral-500 mt-1">태그히어 CRM에 필요한 장비를 구매하세요.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Product List */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-medium text-neutral-900">상품 목록</h2>

          {products.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                <p className="text-neutral-500">등록된 상품이 없습니다.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {products.map(product => (
                <Card key={product.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  {/* 상품 이미지 또는 플레이스홀더 */}
                  <div className="aspect-square bg-neutral-100 relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-neutral-300" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-neutral-900 mb-2 line-clamp-2">
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="text-sm text-neutral-500 mb-4 line-clamp-2">
                        {product.description}
                      </p>
                    ) : (
                      <div className="mb-4" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-neutral-900">
                        {formatPrice(product.price)}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => addToCart(product)}
                        className="gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        담기
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cart & Checkout */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                장바구니
                {cart.length > 0 && (
                  <span className="ml-auto text-sm font-normal text-neutral-500">
                    {cart.length}개 상품
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="text-neutral-500 text-sm text-center py-4">
                  장바구니가 비어있습니다.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div
                        key={item.product.id}
                        className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg"
                      >
                        {/* 장바구니 아이템 이미지 또는 플레이스홀더 */}
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="w-12 h-12 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-neutral-200 rounded flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-5 h-5 text-neutral-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">
                            {item.product.name}
                          </p>
                          <p className="text-sm text-neutral-600">
                            {formatPrice(item.product.price)}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              onClick={() => updateQuantity(item.product.id, -1)}
                              className="p-1.5 hover:bg-neutral-200 rounded transition-colors"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-medium w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.product.id, 1)}
                              className="p-1.5 hover:bg-neutral-200 rounded transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.product.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded ml-auto transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center p-3 bg-brand-50 rounded-lg">
                      <span className="font-semibold text-neutral-700">총 결제금액</span>
                      <span className="text-2xl font-bold text-brand-600">
                        {formatPrice(totalAmount)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Customer Info */}
          {cart.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">구매자 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    이름 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={customerInfo.name}
                    onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    연락처 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={customerInfo.phone}
                    onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    placeholder="01012345678"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    이메일 (선택)
                  </label>
                  <Input
                    type="email"
                    value={customerInfo.email}
                    onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    placeholder="example@email.com"
                  />
                </div>
                <Button
                  className="w-full mt-2"
                  onClick={proceedToPayment}
                  disabled={!customerInfo.name || !customerInfo.phone}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  결제하기
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
              결제하기
            </h3>

            <div className="p-3 bg-neutral-50 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <span className="text-neutral-600">결제 금액</span>
                <span className="text-xl font-bold text-brand-600">
                  {formatPrice(totalAmount)}
                </span>
              </div>
            </div>

            <div key={`store-widget-${widgetKey}`}>
              <div id="store-payment-methods" className="mb-3" />
              <div id="store-agreement" className="mb-3" />
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowPayment(false)}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                onClick={handlePayment}
                disabled={!isPaymentReady || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    결제 중...
                  </>
                ) : !isPaymentReady ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    준비 중...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    결제하기
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
