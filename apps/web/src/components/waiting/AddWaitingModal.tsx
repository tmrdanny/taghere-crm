'use client';

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WaitingType } from './types';
import { Loader2 } from 'lucide-react';

interface AddWaitingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: WaitingType[];
  preSelectedTypeId?: string | null;
  onSubmit: (data: {
    waitingTypeId: string;
    phone: string | null;
    name: string | null;
    partySize: number;
    adultCount: number;
    childCount: number;
    consentService: boolean;
    consentPrivacy: boolean;
    consentThirdParty: boolean;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function AddWaitingModal({
  open,
  onOpenChange,
  types,
  preSelectedTypeId,
  onSubmit,
  isLoading = false,
}: AddWaitingModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string>(preSelectedTypeId || '');
  const [phone, setPhone] = useState('');
  const [noPhone, setNoPhone] = useState(false);
  const [name, setName] = useState('');
  const [adultCount, setAdultCount] = useState<number>(1);
  const [childCount, setChildCount] = useState<number>(0);
  const [consentService, setConsentService] = useState(false);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentThirdParty, setConsentThirdParty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedTypeId(preSelectedTypeId || '');
      setPhone('');
      setNoPhone(false);
      setName('');
      setAdultCount(1);
      setChildCount(0);
      setConsentService(false);
      setConsentPrivacy(false);
      setConsentThirdParty(false);
      setErrors({});
    } else if (preSelectedTypeId) {
      setSelectedTypeId(preSelectedTypeId);
    }
    onOpenChange(isOpen);
  };

  // Format phone number as user types
  const handlePhoneChange = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Format as 010-1234-5678
    let formatted = digits;
    if (digits.length > 3) {
      formatted = digits.slice(0, 3) + '-' + digits.slice(3);
    }
    if (digits.length > 7) {
      formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
    }

    setPhone(formatted);
  };

  // Validate form
  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!selectedTypeId) {
      newErrors.type = '웨이팅 유형을 선택해주세요.';
    }

    if (!noPhone && !phone) {
      newErrors.phone = '전화번호를 입력해주세요.';
    } else if (!noPhone && phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = '올바른 전화번호를 입력해주세요.';
    }

    if (noPhone && !name.trim()) {
      newErrors.name = '번호 없음 선택 시 이름은 필수입니다.';
    }

    if (!consentService) {
      newErrors.consent = '서비스 이용약관에 동의해주세요.';
    }

    if (!consentPrivacy) {
      newErrors.consent = '개인정보 수집 및 이용에 동의해주세요.';
    }

    if (!consentThirdParty) {
      newErrors.consent = '개인정보 제3자 제공에 동의해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validate()) return;

    const partySize = adultCount + childCount;
    await onSubmit({
      waitingTypeId: selectedTypeId,
      phone: noPhone ? null : phone.replace(/\D/g, ''),
      name: name.trim() || null,
      partySize,
      adultCount,
      childCount,
      consentService,
      consentPrivacy,
      consentThirdParty,
    });
  };

  const activeTypes = types.filter((t) => t.isActive);
  const selectedType = activeTypes.find((t) => t.id === selectedTypeId);
  const minPartySize = selectedType?.minPartySize || 1;
  const maxPartySize = selectedType?.maxPartySize || 20;
  const totalPartySize = adultCount + childCount;

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>웨이팅 등록</ModalTitle>
        </ModalHeader>

        <div className="space-y-5 py-2">
          {/* Waiting Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              웨이팅 유형 <span className="text-error">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {activeTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setSelectedTypeId(type.id);
                    const min = type.minPartySize || 1;
                    const total = adultCount + childCount;
                    if (total < min) setAdultCount(min);
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                    selectedTypeId === type.id
                      ? 'border-brand-800 bg-brand-50 text-brand-800'
                      : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                  )}
                >
                  {type.name}
                </button>
              ))}
            </div>
            {errors.type && (
              <p className="text-xs text-error">{errors.type}</p>
            )}
          </div>

          {/* Phone Number */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-900">
                휴대전화번호 {!noPhone && <span className="text-error">*</span>}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={noPhone}
                  onChange={(e) => {
                    setNoPhone(e.target.checked);
                    if (e.target.checked) {
                      setPhone('');
                    }
                  }}
                  className="w-4 h-4 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                />
                <span className="text-neutral-600">번호 없음</span>
              </label>
            </div>
            <Input
              type="tel"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              disabled={noPhone}
              className={cn(noPhone && 'bg-neutral-100 text-neutral-400')}
            />
            {errors.phone && (
              <p className="text-xs text-error">{errors.phone}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              이름 {noPhone && <span className="text-error">*</span>}
            </label>
            <Input
              type="text"
              placeholder="이름을 입력해 주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-xs text-error">{errors.name}</p>
            )}
          </div>

          {/* Consent Checkboxes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              고객에게 직접 약관 동의를 받아주세요 <span className="text-error">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentService}
                  onChange={(e) => setConsentService(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                />
                <span className="text-neutral-700">(필수) 서비스 이용약관 동의</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPrivacy}
                  onChange={(e) => setConsentPrivacy(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                />
                <span className="text-neutral-700">(필수) 개인정보 수집 및 이용 동의</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentThirdParty}
                  onChange={(e) => setConsentThirdParty(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                />
                <span className="text-neutral-700">(필수) 개인정보 제3자 제공 동의</span>
              </label>
            </div>
            {errors.consent && (
              <p className="text-xs text-error">{errors.consent}</p>
            )}
          </div>

          {/* Adult Count */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              성인 <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setAdultCount(Math.max(1, adultCount - 1))}
                disabled={adultCount <= 1}
                className="w-10 h-10 rounded-lg border border-neutral-200 bg-white text-neutral-600 font-bold flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <div className="flex-1 h-10 border border-neutral-200 rounded-lg flex items-center justify-center bg-white">
                <span className="text-lg font-semibold text-neutral-900">{adultCount}명</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (totalPartySize < maxPartySize) {
                    setAdultCount(adultCount + 1);
                  }
                }}
                disabled={totalPartySize >= maxPartySize}
                className="w-10 h-10 rounded-lg border border-neutral-200 bg-white text-neutral-600 font-bold flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>

          {/* Child Count */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-900">
              유아
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setChildCount(Math.max(0, childCount - 1))}
                disabled={childCount <= 0}
                className="w-10 h-10 rounded-lg border border-neutral-200 bg-white text-neutral-600 font-bold flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <div className="flex-1 h-10 border border-neutral-200 rounded-lg flex items-center justify-center bg-white">
                <span className="text-lg font-semibold text-neutral-900">{childCount}명</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (totalPartySize < maxPartySize) {
                    setChildCount(childCount + 1);
                  }
                }}
                disabled={totalPartySize >= maxPartySize}
                className="w-10 h-10 rounded-lg border border-neutral-200 bg-white text-neutral-600 font-bold flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>

          {/* Total Party Size */}
          <div className="bg-neutral-50 rounded-lg p-3 text-center">
            <span className="text-sm text-neutral-500">총 인원: </span>
            <span className="font-bold text-neutral-900">{totalPartySize}명</span>
            <span className="text-xs text-neutral-400 ml-2">
              ({minPartySize > 1 ? `${minPartySize}~${maxPartySize}명` : `최대 ${maxPartySize}명`})
            </span>
          </div>
        </div>

        <ModalFooter className="mt-4">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                등록 중...
              </>
            ) : (
              '웨이팅 등록'
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
