const dark = {
  surfaceCanvas: '#0B0B0D',
  surfaceCard: '#1C1C1F',
  surfaceMuted: '#26262A',
  surfaceElevated: '#222226',

  border: '#2E2E33',
  divider: '#2E2E33',

  textPrimary: '#F5F5F7',
  textSecondary: '#98989D',
  textMuted: '#6A6A70',
  placeholder: '#6A6A70',

  accent: '#C4E052',
  accentHover: '#B2CE47',
  accentLight: '#1F2410',
  accentSurface: '#2A3316',

  olive: '#A8C13D',
  oliveHover: '#96AD33',
  olivePressed: '#839627',

  primary: '#A8C13D',
  primaryPressed: '#96AD33',
  primaryText: '#0E0E10',
  onPrimary: '#0E0E10',

  error: '#FF6B6B',
  errorSurface: '#2A1416',
  success: '#4ADE80',
  successSurface: '#0A2018',
  warning: '#FBBF24',
  warningSurface: '#2A1F0A',

  white: '#FFFFFF',
  black: '#000000',
  disabledSurface: '#1A1A1D',

  background: '#0B0B0D',
  link: '#C4E052',
  surface: '#1C1C1F',
  card: '#1C1C1F',
  canvas: '#0B0B0D',
};

const light = {
  surfaceCanvas: '#F7F7F8',
  surfaceCard: '#FFFFFF',
  surfaceMuted: '#EFEFF1',
  surfaceElevated: '#FFFFFF',

  border: '#E4E4E7',
  divider: '#E4E4E7',

  textPrimary: '#1A1A1C',
  textSecondary: '#6A6A70',
  textMuted: '#9A9AA0',
  placeholder: '#9A9AA0',

  accent: '#7A9E1F',
  accentHover: '#6A8A1A',
  accentLight: '#EAF3D0',
  accentSurface: '#E5EFC5',

  olive: '#7A9E1F',
  oliveHover: '#6A8A1A',
  olivePressed: '#5A7715',

  primary: '#7A9E1F',
  primaryPressed: '#6A8A1A',
  primaryText: '#FFFFFF',
  onPrimary: '#FFFFFF',

  error: '#D32F2F',
  errorSurface: '#FCEAEA',
  success: '#1F7A4D',
  successSurface: '#E8F5EC',
  warning: '#B5851F',
  warningSurface: '#FCF3DE',

  white: '#FFFFFF',
  black: '#000000',
  disabledSurface: '#E5E5E8',

  background: '#F7F7F8',
  link: '#7A9E1F',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  canvas: '#F7F7F8',
};

// Backward compatibility: any file still doing `import colors from ...`
// gets the dark palette by default.
export const colors = dark;
export const palettes = { dark, light };
export default dark;