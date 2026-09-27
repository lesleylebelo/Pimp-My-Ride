export const theme = {
  colors: {
    brandGreen: '#14382c',
    brandGreenHover: '#0f2a21',
    brandGreenLight: '#edf5f1',
    goldAccent: '#c99a2e',
    goldAccentHover: '#b58826',
    goldAccentLight: '#fdf8eb',
    surfaceCard: '#ffffff',
    surfaceCanvas: '#f8f9fa',
    border: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    error: '#c0392b',
    errorSurface: '#fbeae8',
    success: '#1f7a4d',
    successSurface: '#e8f5ec',
  },
  radius: {
    button: '8px',
    card: '12px',
    pill: '9999px',
  },
};

export const colors = {
  ...theme.colors,
  primary: theme.colors.brandGreen,
  primaryPressed: theme.colors.brandGreenHover,
  background: theme.colors.surfaceCanvas,
  white: theme.colors.surfaceCard,
  black: '#000000',
  placeholder: theme.colors.textMuted,
  divider: theme.colors.border,
  disabledSurface: theme.colors.surfaceCanvas,
  link: theme.colors.brandGreen,
};

export default colors;
