import { Star } from 'lucide-react';

// 별점 컴포넌트
export function StarRating({ rating, onRatingChange, readonly = false }: { rating: number; onRatingChange?: (rating: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onRatingChange?.(star)}
          className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
        >
          <Star
            className={`w-6 h-6 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-neutral-300'}`}
          />
        </button>
      ))}
    </div>
  );
}
