
export type TabId = 'summary' | 'comparison' | 'counter' | 'structure';

export type Perspective = 'plaintiff' | 'defendant';

export type InputType = 'text' | 'pdf' | 'image';

export interface ComparisonRow {
  issue: string;
  plaintiff_argument: string;
  plaintiff_evidence: string;
  defendant_argument: string;
  defendant_evidence: string;
}