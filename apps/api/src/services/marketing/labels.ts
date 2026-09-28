// 캠페인 목록에 보여줄 발송 대상 이름
export function targetLabelOf(targetType?: string | null, segmentId?: string | null): string {
  switch (targetType) {
    case 'REVISIT':
      return '재방문 고객';
    case 'NEW':
      return '신규 고객';
    case 'CUSTOM':
      return '직접 선택';
    case 'SEGMENT':
      return segmentId ? '고객 그룹' : '고객 그룹';
    case 'TEST':
      return '테스트';
    default:
      return '전체 고객';
  }
}
