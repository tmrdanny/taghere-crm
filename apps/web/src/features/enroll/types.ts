// enroll 계열 고객 페이지에서 공용으로 쓰는 타입.

export interface VisitSourceOption {
  id: string;
  label: string;
}

export interface SurveyQuestion {
  id: string;
  type: 'DATE' | 'TEXT' | 'CHOICE';
  label: string;
  description: string | null;
  required: boolean;
  choiceOptions?: string[] | null;
}
