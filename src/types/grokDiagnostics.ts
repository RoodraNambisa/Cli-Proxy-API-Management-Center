export interface GrokHeaderDiagnostic {
  name: string;
  value?: string;
  source: string;
  redacted?: boolean;
  missing?: boolean;
  example?: boolean;
}
export interface GrokTransmission {
  id: number;
  stage: string;
  url: string;
  url_source?: string;
  headers: GrokHeaderDiagnostic[];
  status?: number;
  preview?: boolean;
  compression: {
    enabled: boolean;
    reason: string;
    settings_url?: string;
    supported?: boolean;
    original_bytes?: number;
    sent_bytes?: number;
  };
  capabilities?: {
    model: string;
    node: string;
    thinking_known: boolean;
    thinking_source: string;
    image_source: string;
    max_edit_images: number;
    quality_known: boolean;
    quality_source: string;
    quality_values?: string[];
    file_id_known: boolean;
    file_id_inputs: boolean;
    file_id_source: string;
  };
}
export interface GrokOptions {
  credentials: Array<{ id: string; name: string; models: string[]; disabled: boolean }>;
  client_version: string;
  version_source: string;
  capabilities?: { headers_preview?: boolean; xai_diagnostics?: boolean };
}
export interface GrokHeaderPreviewRequest {
  name: string;
  model: string;
  purpose: string;
  protocol: string;
  stream: boolean;
  config: Record<string, unknown>;
  client_headers?: Record<string, string[]>;
  request_body?: Record<string, unknown>;
}
