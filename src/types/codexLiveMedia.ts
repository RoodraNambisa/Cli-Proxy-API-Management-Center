export interface CodexLiveICEServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CodexLiveMediaConfig {
  enabled: boolean;
  maxSessions: number;
  disablePrivateRemoteIps: boolean;
  publicIp: string;
  udpPortMin: number;
  udpPortMax: number;
  iceServers: CodexLiveICEServer[];
}

export interface CodexLiveICEVisualEntry {
  id: string;
  sourceIndex?: number;
  urls: string;
  username: string;
  credential: string;
}

export interface CodexLiveMediaVisualConfig {
  enabled: boolean;
  maxSessions: string;
  disablePrivateRemoteIps: boolean;
  publicIp: string;
  udpPortMin: string;
  udpPortMax: string;
  iceServers: CodexLiveICEVisualEntry[];
}

export const DEFAULT_CODEX_LIVE_MEDIA: CodexLiveMediaVisualConfig = {
  enabled: false, maxSessions: '0', disablePrivateRemoteIps: false, publicIp: '',
  udpPortMin: '0', udpPortMax: '0', iceServers: [],
};

export type CodexLiveMediaValidationCode =
  | 'codex_media_capacity' | 'codex_media_ports' | 'codex_media_ip'
  | 'codex_media_ice_url' | 'codex_media_ice_credentials';
