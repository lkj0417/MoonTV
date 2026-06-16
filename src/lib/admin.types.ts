export interface Source {
  key: string;
  name: string;
  api: string;
  detail?: string;
  from: 'config' | 'custom';
  disabled?: boolean;
}

export interface CustomCategory {
  name?: string;
  type: 'movie' | 'tv';
  query: string;
  from: 'config' | 'custom';
  disabled?: boolean;
}

export interface AdminConfig {
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    ImageProxy: string;
    DisableYellowFilter: boolean;
    EnableWebLive?: boolean;
    UserAgent?: string;
  };
  UserConfig: {
    AllowRegister: boolean;
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
    }[];
  };
  SourceConfig: Source[];
  CustomCategories: CustomCategory[];
  ConfigSubscribtion?: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck?: string;
  };
  ConfigFile?: string;
  LiveConfig?: {
    key: string;
    name: string;
    url: string;
    ua?: string;
    epg?: string;
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}