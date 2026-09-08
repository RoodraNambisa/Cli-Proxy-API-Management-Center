export interface ModelThinking {
  min?: number;
  max?: number;
  zeroAllowed?: boolean;
  dynamicAllowed?: boolean;
  levels?: string[];
  [key: string]: unknown;
}
