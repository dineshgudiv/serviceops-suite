export type ThemePresetKey =
  | 'midnight'
  | 'ocean'
  | 'ember'
  | 'forest'
  | 'slate'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'graphite'
  | 'arctic'
  | 'crimson'
  | 'copper';

export type ThemeMode = 'dark' | 'light' | 'system';
export type SurfaceContrast = 'soft' | 'balanced' | 'strong';
export type SidebarIntensity = 'soft' | 'medium' | 'strong';
export type RadiusScale = 'compact' | 'default' | 'rounded';
export type DensityScale = 'compact' | 'comfortable' | 'spacious';
export type FontScale = 'small' | 'default' | 'large';
export type ChartPaletteKey = 'default' | 'analyst' | 'vivid' | 'colorblind';
export type AccentKey =
  | 'preset'
  | 'blue'
  | 'cyan'
  | 'indigo'
  | 'violet'
  | 'rose'
  | 'amber'
  | 'emerald'
  | 'crimson'
  | 'copper';

export type ThemeSettings = {
  preset: ThemePresetKey;
  accent: AccentKey;
  mode: ThemeMode;
  surfaceContrast: SurfaceContrast;
  sidebarIntensity: SidebarIntensity;
  radius: RadiusScale;
  density: DensityScale;
  fontScale: FontScale;
  chartPalette: ChartPaletteKey;
  reducedMotion: boolean;
  highContrast: boolean;
};

type ToneTokens = {
  bg: string;
  bg2: string;
  bg3: string;
  card: string;
  card2: string;
  cardFg: string;
  text: string;
  muted: string;
  border: string;
  sidebarBg: string;
  sidebarFg: string;
  sidebarActive: string;
  headerBg: string;
  inputBg: string;
  elevated: string;
  primary: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  ring: string;
  success: string;
  warning: string;
  danger: string;
};

type ThemePreset = {
  label: string;
  description: string;
  dark: ToneTokens;
  light: ToneTokens;
};

export const THEME_STORAGE_KEY = 'ui.theme.studio';

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  preset: 'midnight',
  accent: 'preset',
  mode: 'system',
  surfaceContrast: 'balanced',
  sidebarIntensity: 'medium',
  radius: 'default',
  density: 'comfortable',
  fontScale: 'default',
  chartPalette: 'default',
  reducedMotion: false,
  highContrast: false,
};

export const themePresets: Record<ThemePresetKey, ThemePreset> = {
  midnight: {
    label: 'Midnight',
    description: 'Deep navy control room',
    dark: {
      bg: '#06111d',
      bg2: '#0a1727',
      bg3: '#112036',
      card: '#0f1b2f',
      card2: '#16253d',
      cardFg: '#e6eefc',
      text: '#e6eefc',
      muted: '#91a5c8',
      border: '#243652',
      sidebarBg: '#0b1627',
      sidebarFg: '#dbe7fb',
      sidebarActive: 'rgba(94, 162, 255, 0.2)',
      headerBg: 'rgba(8, 17, 31, 0.84)',
      inputBg: '#0d1728',
      elevated: 'rgba(17, 27, 46, 0.9)',
      primary: '#5ea2ff',
      primaryFg: '#03111d',
      accent: '#5ea2ff',
      accentFg: '#03111d',
      ring: 'rgba(94, 162, 255, 0.5)',
      success: '#36d399',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
    light: {
      bg: '#f4f8ff',
      bg2: '#eaf1fb',
      bg3: '#dce7f7',
      card: '#ffffff',
      card2: '#f6f9ff',
      cardFg: '#10213a',
      text: '#10213a',
      muted: '#5d7196',
      border: '#c8d6ee',
      sidebarBg: '#e9f0fb',
      sidebarFg: '#142845',
      sidebarActive: 'rgba(56, 104, 189, 0.14)',
      headerBg: 'rgba(244, 248, 255, 0.85)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#2f6ed4',
      primaryFg: '#ffffff',
      accent: '#2f6ed4',
      accentFg: '#ffffff',
      ring: 'rgba(47, 110, 212, 0.35)',
      success: '#0f9f75',
      warning: '#c17b07',
      danger: '#c63f3f',
    },
  },
  ocean: {
    label: 'Ocean',
    description: 'Blue-green operations floor',
    dark: {
      bg: '#04131a',
      bg2: '#08212e',
      bg3: '#103144',
      card: '#0d2836',
      card2: '#153545',
      cardFg: '#def8ff',
      text: '#def8ff',
      muted: '#8bbfd2',
      border: '#245066',
      sidebarBg: '#071d29',
      sidebarFg: '#dcf6fd',
      sidebarActive: 'rgba(65, 198, 255, 0.22)',
      headerBg: 'rgba(5, 22, 31, 0.84)',
      inputBg: '#0b2632',
      elevated: 'rgba(9, 33, 46, 0.92)',
      primary: '#41c6ff',
      primaryFg: '#03131a',
      accent: '#41c6ff',
      accentFg: '#03131a',
      ring: 'rgba(65, 198, 255, 0.5)',
      success: '#38d6a7',
      warning: '#f2b54c',
      danger: '#ff6a6a',
    },
    light: {
      bg: '#f2fbff',
      bg2: '#e3f6fb',
      bg3: '#d2edf5',
      card: '#ffffff',
      card2: '#f4fcff',
      cardFg: '#10333f',
      text: '#10333f',
      muted: '#597f8d',
      border: '#c3e0e9',
      sidebarBg: '#e0f2f8',
      sidebarFg: '#143c4a',
      sidebarActive: 'rgba(37, 150, 200, 0.14)',
      headerBg: 'rgba(242, 251, 255, 0.85)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#1889b7',
      primaryFg: '#ffffff',
      accent: '#1889b7',
      accentFg: '#ffffff',
      ring: 'rgba(24, 137, 183, 0.34)',
      success: '#0f9576',
      warning: '#b67d14',
      danger: '#c94949',
    },
  },
  ember: {
    label: 'Ember',
    description: 'Warm incident command',
    dark: {
      bg: '#180c0a',
      bg2: '#261312',
      bg3: '#361d1a',
      card: '#301614',
      card2: '#41201d',
      cardFg: '#ffede8',
      text: '#ffede8',
      muted: '#d2a49d',
      border: '#69403b',
      sidebarBg: '#21110f',
      sidebarFg: '#ffebe5',
      sidebarActive: 'rgba(255, 143, 97, 0.22)',
      headerBg: 'rgba(24, 12, 10, 0.86)',
      inputBg: '#23110f',
      elevated: 'rgba(48, 22, 20, 0.92)',
      primary: '#ff8f61',
      primaryFg: '#220f0d',
      accent: '#ff8f61',
      accentFg: '#220f0d',
      ring: 'rgba(255, 143, 97, 0.48)',
      success: '#4cd49b',
      warning: '#f4b64c',
      danger: '#ff6c6c',
    },
    light: {
      bg: '#fff6f3',
      bg2: '#fce9e3',
      bg3: '#f7dad1',
      card: '#ffffff',
      card2: '#fff7f3',
      cardFg: '#48231f',
      text: '#48231f',
      muted: '#8a5f58',
      border: '#ebc8bf',
      sidebarBg: '#f8e3dc',
      sidebarFg: '#532620',
      sidebarActive: 'rgba(199, 94, 51, 0.14)',
      headerBg: 'rgba(255, 246, 243, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#d7683a',
      primaryFg: '#ffffff',
      accent: '#d7683a',
      accentFg: '#ffffff',
      ring: 'rgba(215, 104, 58, 0.35)',
      success: '#118f63',
      warning: '#b9780d',
      danger: '#c84242',
    },
  },
  forest: {
    label: 'Forest',
    description: 'Green operations signal',
    dark: {
      bg: '#08130d',
      bg2: '#102119',
      bg3: '#173126',
      card: '#12251c',
      card2: '#183428',
      cardFg: '#e8fff0',
      text: '#e8fff0',
      muted: '#9bcbb0',
      border: '#2d5942',
      sidebarBg: '#0d1d16',
      sidebarFg: '#e6fff1',
      sidebarActive: 'rgba(93, 223, 150, 0.2)',
      headerBg: 'rgba(8, 19, 13, 0.84)',
      inputBg: '#102017',
      elevated: 'rgba(18, 37, 28, 0.92)',
      primary: '#5ddf96',
      primaryFg: '#072014',
      accent: '#5ddf96',
      accentFg: '#072014',
      ring: 'rgba(93, 223, 150, 0.45)',
      success: '#36d399',
      warning: '#f4bd54',
      danger: '#ff7676',
    },
    light: {
      bg: '#f4fff8',
      bg2: '#e6f6ec',
      bg3: '#d5ebdf',
      card: '#ffffff',
      card2: '#f7fff9',
      cardFg: '#183326',
      text: '#183326',
      muted: '#5f7e6e',
      border: '#c8e0d1',
      sidebarBg: '#dfeee4',
      sidebarFg: '#183427',
      sidebarActive: 'rgba(47, 140, 88, 0.14)',
      headerBg: 'rgba(244, 255, 248, 0.88)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#238454',
      primaryFg: '#ffffff',
      accent: '#238454',
      accentFg: '#ffffff',
      ring: 'rgba(35, 132, 84, 0.32)',
      success: '#118a64',
      warning: '#ac7d0f',
      danger: '#bf4747',
    },
  },
  slate: {
    label: 'Slate',
    description: 'Neutral executive dark',
    dark: {
      bg: '#0d1016',
      bg2: '#151922',
      bg3: '#1d2430',
      card: '#171d28',
      card2: '#202736',
      cardFg: '#edf2fb',
      text: '#edf2fb',
      muted: '#99a4b8',
      border: '#313c50',
      sidebarBg: '#10151d',
      sidebarFg: '#ebf0f9',
      sidebarActive: 'rgba(144, 163, 189, 0.18)',
      headerBg: 'rgba(13, 16, 22, 0.84)',
      inputBg: '#141923',
      elevated: 'rgba(23, 29, 40, 0.94)',
      primary: '#8ea4c5',
      primaryFg: '#0d1016',
      accent: '#8ea4c5',
      accentFg: '#0d1016',
      ring: 'rgba(142, 164, 197, 0.4)',
      success: '#53c28b',
      warning: '#e8b24d',
      danger: '#ea5d5d',
    },
    light: {
      bg: '#f7f9fc',
      bg2: '#edf1f7',
      bg3: '#e1e8f2',
      card: '#ffffff',
      card2: '#f7f9fc',
      cardFg: '#202b3d',
      text: '#202b3d',
      muted: '#697489',
      border: '#d4dce9',
      sidebarBg: '#e7ecf4',
      sidebarFg: '#243145',
      sidebarActive: 'rgba(110, 127, 150, 0.14)',
      headerBg: 'rgba(247, 249, 252, 0.88)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#53657f',
      primaryFg: '#ffffff',
      accent: '#53657f',
      accentFg: '#ffffff',
      ring: 'rgba(83, 101, 127, 0.3)',
      success: '#167d5c',
      warning: '#9f700b',
      danger: '#b33f3f',
    },
  },
  indigo: {
    label: 'Indigo',
    description: 'Structured executive accent',
    dark: {
      bg: '#0b1020',
      bg2: '#121833',
      bg3: '#1a2147',
      card: '#141c3a',
      card2: '#1e2752',
      cardFg: '#ebefff',
      text: '#ebefff',
      muted: '#99a6d9',
      border: '#313d74',
      sidebarBg: '#0e1430',
      sidebarFg: '#e8edff',
      sidebarActive: 'rgba(129, 140, 248, 0.2)',
      headerBg: 'rgba(11, 16, 32, 0.84)',
      inputBg: '#101833',
      elevated: 'rgba(20, 28, 58, 0.94)',
      primary: '#818cf8',
      primaryFg: '#0b1020',
      accent: '#818cf8',
      accentFg: '#0b1020',
      ring: 'rgba(129, 140, 248, 0.45)',
      success: '#50d2a0',
      warning: '#f1be51',
      danger: '#f66f6f',
    },
    light: {
      bg: '#f5f6ff',
      bg2: '#e9ecfb',
      bg3: '#dde1f8',
      card: '#ffffff',
      card2: '#f7f8ff',
      cardFg: '#232c55',
      text: '#232c55',
      muted: '#66729d',
      border: '#d2d8f1',
      sidebarBg: '#e6e9f9',
      sidebarFg: '#262f5b',
      sidebarActive: 'rgba(88, 102, 212, 0.14)',
      headerBg: 'rgba(245, 246, 255, 0.88)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#5563d4',
      primaryFg: '#ffffff',
      accent: '#5563d4',
      accentFg: '#ffffff',
      ring: 'rgba(85, 99, 212, 0.33)',
      success: '#178363',
      warning: '#9c740d',
      danger: '#b84141',
    },
  },
  violet: {
    label: 'Violet',
    description: 'Analyst collaboration tone',
    dark: {
      bg: '#120e22',
      bg2: '#1b1534',
      bg3: '#241d48',
      card: '#1c1637',
      card2: '#261f4d',
      cardFg: '#f2ebff',
      text: '#f2ebff',
      muted: '#b2a1d8',
      border: '#483a74',
      sidebarBg: '#151028',
      sidebarFg: '#f1ebff',
      sidebarActive: 'rgba(167, 139, 250, 0.2)',
      headerBg: 'rgba(18, 14, 34, 0.84)',
      inputBg: '#18132e',
      elevated: 'rgba(28, 22, 55, 0.94)',
      primary: '#a78bfa',
      primaryFg: '#130f24',
      accent: '#a78bfa',
      accentFg: '#130f24',
      ring: 'rgba(167, 139, 250, 0.45)',
      success: '#58d4a2',
      warning: '#f0bc4f',
      danger: '#f16a76',
    },
    light: {
      bg: '#faf6ff',
      bg2: '#f0e8fb',
      bg3: '#e6daf6',
      card: '#ffffff',
      card2: '#fbf8ff',
      cardFg: '#3e2b5d',
      text: '#3e2b5d',
      muted: '#7f6d9d',
      border: '#ddcff0',
      sidebarBg: '#efe6fa',
      sidebarFg: '#442f67',
      sidebarActive: 'rgba(136, 90, 210, 0.14)',
      headerBg: 'rgba(250, 246, 255, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#8f5be2',
      primaryFg: '#ffffff',
      accent: '#8f5be2',
      accentFg: '#ffffff',
      ring: 'rgba(143, 91, 226, 0.34)',
      success: '#188060',
      warning: '#a56f0d',
      danger: '#bf485e',
    },
  },
  rose: {
    label: 'Rose',
    description: 'Warm executive reporting',
    dark: {
      bg: '#1a0e18',
      bg2: '#261422',
      bg3: '#351a2f',
      card: '#2b1525',
      card2: '#391d31',
      cardFg: '#ffedf5',
      text: '#ffedf5',
      muted: '#d6a7bb',
      border: '#6e3d58',
      sidebarBg: '#1f1020',
      sidebarFg: '#ffebf4',
      sidebarActive: 'rgba(251, 113, 133, 0.2)',
      headerBg: 'rgba(26, 14, 24, 0.84)',
      inputBg: '#23111f',
      elevated: 'rgba(43, 21, 37, 0.94)',
      primary: '#fb7185',
      primaryFg: '#240f17',
      accent: '#fb7185',
      accentFg: '#240f17',
      ring: 'rgba(251, 113, 133, 0.45)',
      success: '#56d1a0',
      warning: '#efbd54',
      danger: '#fb7185',
    },
    light: {
      bg: '#fff6f8',
      bg2: '#fcebee',
      bg3: '#f8dbe1',
      card: '#ffffff',
      card2: '#fff7f9',
      cardFg: '#5b2637',
      text: '#5b2637',
      muted: '#936376',
      border: '#eccbd6',
      sidebarBg: '#f8e4ea',
      sidebarFg: '#61293b',
      sidebarActive: 'rgba(214, 76, 110, 0.14)',
      headerBg: 'rgba(255, 246, 248, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#d95068',
      primaryFg: '#ffffff',
      accent: '#d95068',
      accentFg: '#ffffff',
      ring: 'rgba(217, 80, 104, 0.33)',
      success: '#168461',
      warning: '#a97010',
      danger: '#c9445a',
    },
  },
  amber: {
    label: 'Amber',
    description: 'Operations warning posture',
    dark: {
      bg: '#181208',
      bg2: '#251a0d',
      bg3: '#342513',
      card: '#2b1f10',
      card2: '#392816',
      cardFg: '#fff2d8',
      text: '#fff2d8',
      muted: '#d1b689',
      border: '#6d5224',
      sidebarBg: '#1f160b',
      sidebarFg: '#fff2d6',
      sidebarActive: 'rgba(251, 191, 36, 0.22)',
      headerBg: 'rgba(24, 18, 8, 0.84)',
      inputBg: '#22180d',
      elevated: 'rgba(43, 31, 16, 0.94)',
      primary: '#fbbf24',
      primaryFg: '#2a1e0a',
      accent: '#fbbf24',
      accentFg: '#2a1e0a',
      ring: 'rgba(251, 191, 36, 0.4)',
      success: '#4ed2a1',
      warning: '#fbbf24',
      danger: '#f16a5b',
    },
    light: {
      bg: '#fffaf0',
      bg2: '#f8efd7',
      bg3: '#f2e2b9',
      card: '#ffffff',
      card2: '#fffaf2',
      cardFg: '#5b4515',
      text: '#5b4515',
      muted: '#8c7440',
      border: '#e6d39f',
      sidebarBg: '#f3e5c0',
      sidebarFg: '#5f4916',
      sidebarActive: 'rgba(195, 138, 0, 0.16)',
      headerBg: 'rgba(255, 250, 240, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#c68b0d',
      primaryFg: '#ffffff',
      accent: '#c68b0d',
      accentFg: '#ffffff',
      ring: 'rgba(198, 139, 13, 0.3)',
      success: '#137f61',
      warning: '#c68b0d',
      danger: '#c95a48',
    },
  },
  emerald: {
    label: 'Emerald',
    description: 'Clean service health palette',
    dark: {
      bg: '#08150f',
      bg2: '#0f2118',
      bg3: '#163024',
      card: '#11261c',
      card2: '#18342a',
      cardFg: '#e8fff6',
      text: '#e8fff6',
      muted: '#9ccfbb',
      border: '#30604b',
      sidebarBg: '#0b1c15',
      sidebarFg: '#e8fff7',
      sidebarActive: 'rgba(52, 211, 153, 0.22)',
      headerBg: 'rgba(8, 21, 15, 0.84)',
      inputBg: '#0f1f17',
      elevated: 'rgba(17, 38, 28, 0.94)',
      primary: '#34d399',
      primaryFg: '#072014',
      accent: '#34d399',
      accentFg: '#072014',
      ring: 'rgba(52, 211, 153, 0.42)',
      success: '#34d399',
      warning: '#f0bf57',
      danger: '#f36b6b',
    },
    light: {
      bg: '#f1fff8',
      bg2: '#e3f7ed',
      bg3: '#d1ecd9',
      card: '#ffffff',
      card2: '#f7fff9',
      cardFg: '#1d442f',
      text: '#1d442f',
      muted: '#617f70',
      border: '#c4e2d0',
      sidebarBg: '#dff1e6',
      sidebarFg: '#214a33',
      sidebarActive: 'rgba(25, 142, 94, 0.15)',
      headerBg: 'rgba(241, 255, 248, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#1f9a66',
      primaryFg: '#ffffff',
      accent: '#1f9a66',
      accentFg: '#ffffff',
      ring: 'rgba(31, 154, 102, 0.32)',
      success: '#1f9a66',
      warning: '#a87812',
      danger: '#be4d4d',
    },
  },
  graphite: {
    label: 'Graphite',
    description: 'Low-glare operator neutral',
    dark: {
      bg: '#0c0d10',
      bg2: '#14161a',
      bg3: '#1d2026',
      card: '#181b21',
      card2: '#20242d',
      cardFg: '#f0f3f8',
      text: '#f0f3f8',
      muted: '#a0a7b4',
      border: '#343a45',
      sidebarBg: '#111418',
      sidebarFg: '#edf1f7',
      sidebarActive: 'rgba(160, 167, 180, 0.18)',
      headerBg: 'rgba(12, 13, 16, 0.86)',
      inputBg: '#15181d',
      elevated: 'rgba(24, 27, 33, 0.96)',
      primary: '#b0bac9',
      primaryFg: '#111317',
      accent: '#b0bac9',
      accentFg: '#111317',
      ring: 'rgba(176, 186, 201, 0.36)',
      success: '#56cb93',
      warning: '#e7b44c',
      danger: '#eb6666',
    },
    light: {
      bg: '#fafafa',
      bg2: '#f0f2f4',
      bg3: '#e3e7ec',
      card: '#ffffff',
      card2: '#f7f8fa',
      cardFg: '#29303b',
      text: '#29303b',
      muted: '#737b88',
      border: '#d8dde5',
      sidebarBg: '#eceff3',
      sidebarFg: '#2c3440',
      sidebarActive: 'rgba(120, 132, 149, 0.14)',
      headerBg: 'rgba(250, 250, 250, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#697484',
      primaryFg: '#ffffff',
      accent: '#697484',
      accentFg: '#ffffff',
      ring: 'rgba(105, 116, 132, 0.28)',
      success: '#1d8561',
      warning: '#a47410',
      danger: '#b54a4a',
    },
  },
  arctic: {
    label: 'Arctic',
    description: 'Bright high-clarity workspace',
    dark: {
      bg: '#09141c',
      bg2: '#0f202c',
      bg3: '#163043',
      card: '#10202f',
      card2: '#163047',
      cardFg: '#ebf9ff',
      text: '#ebf9ff',
      muted: '#a0c4d3',
      border: '#335a6d',
      sidebarBg: '#0c1a26',
      sidebarFg: '#ecf9ff',
      sidebarActive: 'rgba(125, 211, 252, 0.22)',
      headerBg: 'rgba(9, 20, 28, 0.84)',
      inputBg: '#11202d',
      elevated: 'rgba(16, 32, 47, 0.94)',
      primary: '#7dd3fc',
      primaryFg: '#08202d',
      accent: '#7dd3fc',
      accentFg: '#08202d',
      ring: 'rgba(125, 211, 252, 0.42)',
      success: '#4fd0b1',
      warning: '#e7bc56',
      danger: '#ef6c6c',
    },
    light: {
      bg: '#f5fcff',
      bg2: '#e9f5fb',
      bg3: '#dcedf6',
      card: '#ffffff',
      card2: '#f8fcff',
      cardFg: '#193847',
      text: '#193847',
      muted: '#648392',
      border: '#cae0ea',
      sidebarBg: '#e7f2f7',
      sidebarFg: '#1d4252',
      sidebarActive: 'rgba(65, 160, 210, 0.14)',
      headerBg: 'rgba(245, 252, 255, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#2f93c5',
      primaryFg: '#ffffff',
      accent: '#2f93c5',
      accentFg: '#ffffff',
      ring: 'rgba(47, 147, 197, 0.28)',
      success: '#168266',
      warning: '#a87910',
      danger: '#bc4848',
    },
  },
  crimson: {
    label: 'Crimson',
    description: 'Critical response posture',
    dark: {
      bg: '#1b0b11',
      bg2: '#281118',
      bg3: '#361722',
      card: '#2d141c',
      card2: '#3b1b25',
      cardFg: '#ffebef',
      text: '#ffebef',
      muted: '#d5a0ad',
      border: '#733a4b',
      sidebarBg: '#210d13',
      sidebarFg: '#ffe7ec',
      sidebarActive: 'rgba(244, 63, 94, 0.2)',
      headerBg: 'rgba(27, 11, 17, 0.84)',
      inputBg: '#231016',
      elevated: 'rgba(45, 20, 28, 0.94)',
      primary: '#f43f5e',
      primaryFg: '#230d13',
      accent: '#f43f5e',
      accentFg: '#230d13',
      ring: 'rgba(244, 63, 94, 0.42)',
      success: '#4fc997',
      warning: '#ebb34e',
      danger: '#f43f5e',
    },
    light: {
      bg: '#fff5f7',
      bg2: '#fae6ea',
      bg3: '#f4d5dc',
      card: '#ffffff',
      card2: '#fff7f9',
      cardFg: '#5f2230',
      text: '#5f2230',
      muted: '#96606e',
      border: '#ebcad3',
      sidebarBg: '#f5e1e7',
      sidebarFg: '#632433',
      sidebarActive: 'rgba(209, 47, 82, 0.14)',
      headerBg: 'rgba(255, 245, 247, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#d33353',
      primaryFg: '#ffffff',
      accent: '#d33353',
      accentFg: '#ffffff',
      ring: 'rgba(211, 51, 83, 0.32)',
      success: '#177f61',
      warning: '#a97310',
      danger: '#d33353',
    },
  },
  copper: {
    label: 'Copper',
    description: 'Warm industrial operations',
    dark: {
      bg: '#17100d',
      bg2: '#231713',
      bg3: '#311f18',
      card: '#2a1a14',
      card2: '#38231b',
      cardFg: '#fff0e7',
      text: '#fff0e7',
      muted: '#cfad9b',
      border: '#6c493a',
      sidebarBg: '#1d130f',
      sidebarFg: '#ffefe8',
      sidebarActive: 'rgba(217, 119, 87, 0.22)',
      headerBg: 'rgba(23, 16, 13, 0.84)',
      inputBg: '#221612',
      elevated: 'rgba(42, 26, 20, 0.94)',
      primary: '#d97757',
      primaryFg: '#24140f',
      accent: '#d97757',
      accentFg: '#24140f',
      ring: 'rgba(217, 119, 87, 0.4)',
      success: '#54cb95',
      warning: '#ebb34f',
      danger: '#ef6d61',
    },
    light: {
      bg: '#fff8f4',
      bg2: '#f6ebe4',
      bg3: '#efdccf',
      card: '#ffffff',
      card2: '#fff8f5',
      cardFg: '#553328',
      text: '#553328',
      muted: '#876252',
      border: '#e5ccbd',
      sidebarBg: '#f2e2d8',
      sidebarFg: '#593428',
      sidebarActive: 'rgba(183, 95, 61, 0.14)',
      headerBg: 'rgba(255, 248, 244, 0.9)',
      inputBg: '#ffffff',
      elevated: '#ffffff',
      primary: '#ba613f',
      primaryFg: '#ffffff',
      accent: '#ba613f',
      accentFg: '#ffffff',
      ring: 'rgba(186, 97, 63, 0.3)',
      success: '#197e5c',
      warning: '#a17011',
      danger: '#bf5143',
    },
  },
};

export const accentOptions: Record<AccentKey, { label: string; color?: string; fg?: string }> = {
  preset: { label: 'Preset' },
  blue: { label: 'Blue', color: '#5ea2ff', fg: '#04111d' },
  cyan: { label: 'Cyan', color: '#41c6ff', fg: '#04131a' },
  indigo: { label: 'Indigo', color: '#818cf8', fg: '#0b1020' },
  violet: { label: 'Violet', color: '#a78bfa', fg: '#130f24' },
  rose: { label: 'Rose', color: '#fb7185', fg: '#240f17' },
  amber: { label: 'Amber', color: '#fbbf24', fg: '#2a1e0a' },
  emerald: { label: 'Emerald', color: '#34d399', fg: '#072014' },
  crimson: { label: 'Crimson', color: '#f43f5e', fg: '#230d13' },
  copper: { label: 'Copper', color: '#d97757', fg: '#24140f' },
};

export const chartPalettes: Record<ChartPaletteKey, { label: string; colors: string[] }> = {
  default: { label: 'Default', colors: ['#5ea2ff', '#34d399', '#f59e0b', '#a78bfa', '#fb7185', '#7dd3fc'] },
  analyst: { label: 'Analyst', colors: ['#60a5fa', '#22c55e', '#fbbf24', '#c084fc', '#fb7185', '#38bdf8'] },
  vivid: { label: 'Vivid', colors: ['#00b8ff', '#8b5cf6', '#f43f5e', '#22c55e', '#f59e0b', '#14b8a6'] },
  colorblind: { label: 'Colorblind', colors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00'] },
};

export function sanitizeThemeSettings(input: unknown): ThemeSettings {
  const raw = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  const out: ThemeSettings = { ...DEFAULT_THEME_SETTINGS };

  if (typeof raw.preset === 'string' && raw.preset in themePresets) out.preset = raw.preset as ThemePresetKey;
  if (typeof raw.accent === 'string' && raw.accent in accentOptions) out.accent = raw.accent as AccentKey;
  if (raw.mode === 'dark' || raw.mode === 'light' || raw.mode === 'system') out.mode = raw.mode;
  if (raw.surfaceContrast === 'soft' || raw.surfaceContrast === 'balanced' || raw.surfaceContrast === 'strong') out.surfaceContrast = raw.surfaceContrast;
  if (raw.sidebarIntensity === 'soft' || raw.sidebarIntensity === 'medium' || raw.sidebarIntensity === 'strong') out.sidebarIntensity = raw.sidebarIntensity;
  if (raw.radius === 'compact' || raw.radius === 'default' || raw.radius === 'rounded') out.radius = raw.radius;
  if (raw.density === 'compact' || raw.density === 'comfortable' || raw.density === 'spacious') out.density = raw.density;
  if (raw.fontScale === 'small' || raw.fontScale === 'default' || raw.fontScale === 'large') out.fontScale = raw.fontScale;
  if (typeof raw.chartPalette === 'string' && raw.chartPalette in chartPalettes) out.chartPalette = raw.chartPalette as ChartPaletteKey;
  if (typeof raw.reducedMotion === 'boolean') out.reducedMotion = raw.reducedMotion;
  if (typeof raw.highContrast === 'boolean') out.highContrast = raw.highContrast;

  return out;
}

export function readStoredThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    return sanitizeThemeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

export function persistThemeSettings(settings: ThemeSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
}

function setVar(root: HTMLElement, name: string, value: string | number) {
  root.style.setProperty(name, String(value));
}

function getResolvedMode(mode: ThemeMode, prefersDark: boolean) {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

export function applyThemeSettings(root: HTMLElement, settings: ThemeSettings, prefersDark: boolean) {
  const preset = themePresets[settings.preset];
  const resolvedMode = getResolvedMode(settings.mode, prefersDark);
  const tokens = resolvedMode === 'dark' ? preset.dark : preset.light;
  const accent = settings.accent === 'preset' ? { color: tokens.accent, fg: tokens.accentFg } : accentOptions[settings.accent];
  const charts = chartPalettes[settings.chartPalette].colors;

  root.dataset.soTheme = settings.preset;
  root.dataset.soMode = settings.mode;
  root.dataset.soResolvedMode = resolvedMode;
  root.dataset.soSurfaceContrast = settings.surfaceContrast;
  root.dataset.soSidebarIntensity = settings.sidebarIntensity;
  root.dataset.soRadius = settings.radius;
  root.dataset.soDensity = settings.density;
  root.dataset.soFontScale = settings.fontScale;
  root.dataset.soChartPalette = settings.chartPalette;
  root.dataset.soReducedMotion = String(settings.reducedMotion);
  root.dataset.soHighContrast = String(settings.highContrast);

  setVar(root, '--bg', tokens.bg);
  setVar(root, '--bg2', tokens.bg2);
  setVar(root, '--bg3', tokens.bg3);
  setVar(root, '--fg', tokens.text);
  setVar(root, '--text', tokens.text);
  setVar(root, '--muted', tokens.muted);
  setVar(root, '--card', tokens.card);
  setVar(root, '--card-2', tokens.card2);
  setVar(root, '--card-fg', tokens.cardFg);
  setVar(root, '--border', tokens.border);
  setVar(root, '--sidebar-bg', tokens.sidebarBg);
  setVar(root, '--sidebar-fg', tokens.sidebarFg);
  setVar(root, '--sidebar-active', tokens.sidebarActive);
  setVar(root, '--header-bg', tokens.headerBg);
  setVar(root, '--input-bg', tokens.inputBg);
  setVar(root, '--elevated', tokens.elevated);
  setVar(root, '--primary', tokens.primary);
  setVar(root, '--primary-fg', tokens.primaryFg);
  setVar(root, '--accent', accent.color ?? tokens.accent);
  setVar(root, '--accent-fg', accent.fg ?? tokens.accentFg);
  setVar(root, '--ring', tokens.ring);
  setVar(root, '--success', tokens.success);
  setVar(root, '--warning', tokens.warning);
  setVar(root, '--danger', tokens.danger);
  setVar(root, '--chart-1', charts[0]);
  setVar(root, '--chart-2', charts[1]);
  setVar(root, '--chart-3', charts[2]);
  setVar(root, '--chart-4', charts[3]);
  setVar(root, '--chart-5', charts[4]);
  setVar(root, '--chart-6', charts[5]);
  setVar(root, '--shadow-strength', settings.surfaceContrast === 'soft' ? '0.18' : settings.surfaceContrast === 'strong' ? '0.34' : '0.26');
  setVar(root, '--surface-alpha', settings.surfaceContrast === 'soft' ? '0.72' : settings.surfaceContrast === 'strong' ? '0.96' : '0.84');
  setVar(root, '--surface-alt-alpha', settings.surfaceContrast === 'soft' ? '0.62' : settings.surfaceContrast === 'strong' ? '0.9' : '0.76');
  setVar(root, '--sidebar-alpha', settings.sidebarIntensity === 'soft' ? '0.58' : settings.sidebarIntensity === 'strong' ? '0.94' : '0.76');
  setVar(root, '--radius-sm', settings.radius === 'compact' ? '8px' : settings.radius === 'rounded' ? '16px' : '10px');
  setVar(root, '--radius-md', settings.radius === 'compact' ? '10px' : settings.radius === 'rounded' ? '18px' : '12px');
  setVar(root, '--radius-lg', settings.radius === 'compact' ? '14px' : settings.radius === 'rounded' ? '24px' : '18px');
  setVar(root, '--density-scale', settings.density === 'compact' ? '0.9' : settings.density === 'spacious' ? '1.12' : '1');
  setVar(root, '--font-scale', settings.fontScale === 'small' ? '0.94' : settings.fontScale === 'large' ? '1.08' : '1');
  setVar(root, '--motion-scale', settings.reducedMotion ? '0' : '1');

  if (settings.highContrast) {
    setVar(root, '--border', resolvedMode === 'dark' ? '#6d7f9f' : '#8fa0bb');
    setVar(root, '--muted', resolvedMode === 'dark' ? '#c3d1eb' : '#42516b');
    setVar(root, '--ring', resolvedMode === 'dark' ? 'rgba(255,255,255,0.72)' : 'rgba(17, 24, 39, 0.54)');
    setVar(root, '--shadow-strength', settings.surfaceContrast === 'soft' ? '0.24' : '0.38');
  }

  root.style.colorScheme = resolvedMode;
}

export function createThemeBootstrapScript() {
  return `(function(){try{var key=${JSON.stringify(THEME_STORAGE_KEY)};var defaults=${JSON.stringify(
    DEFAULT_THEME_SETTINGS
  )};var raw=localStorage.getItem(key);var parsed=raw?JSON.parse(raw):defaults;var v=function(value, allowed, fallback){return allowed.indexOf(value)>=0?value:fallback;};var settings={preset:v(parsed.preset,${JSON.stringify(
    Object.keys(themePresets)
  )},defaults.preset),accent:v(parsed.accent,${JSON.stringify(Object.keys(accentOptions))},defaults.accent),mode:v(parsed.mode,['dark','light','system'],defaults.mode),surfaceContrast:v(parsed.surfaceContrast,['soft','balanced','strong'],defaults.surfaceContrast),sidebarIntensity:v(parsed.sidebarIntensity,['soft','medium','strong'],defaults.sidebarIntensity),radius:v(parsed.radius,['compact','default','rounded'],defaults.radius),density:v(parsed.density,['compact','comfortable','spacious'],defaults.density),fontScale:v(parsed.fontScale,['small','default','large'],defaults.fontScale),chartPalette:v(parsed.chartPalette,${JSON.stringify(
    Object.keys(chartPalettes)
  )},defaults.chartPalette),reducedMotion:!!parsed.reducedMotion,highContrast:!!parsed.highContrast};var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=settings.mode==='system'?(prefersDark?'dark':'light'):settings.mode;var root=document.documentElement;root.dataset.soTheme=settings.preset;root.dataset.soMode=settings.mode;root.dataset.soResolvedMode=resolved;root.dataset.soSurfaceContrast=settings.surfaceContrast;root.dataset.soSidebarIntensity=settings.sidebarIntensity;root.dataset.soRadius=settings.radius;root.dataset.soDensity=settings.density;root.dataset.soFontScale=settings.fontScale;root.dataset.soChartPalette=settings.chartPalette;root.dataset.soReducedMotion=String(settings.reducedMotion);root.dataset.soHighContrast=String(settings.highContrast);}catch(e){}})();`;
}
