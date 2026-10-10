import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes } from './colors';

const STORAGE_KEY = 'theme-mode:v1';
const ThemeContext = createContext({
  mode: 'dark',
  theme: palettes.dark,
  toggleTheme: () => {},
  isDark: true,
});

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (active && (saved === 'light' || saved === 'dark')) setMode(saved);
      })
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function toggleTheme() {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  }

  const theme = palettes[mode];

  return (
    <ThemeContext.Provider value={{ mode, theme, toggleTheme, isDark: mode === 'dark' }}>
      {ready ? children : null}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}