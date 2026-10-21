import React from 'react';
import {AuthProvider} from './src/features/auth/context/AuthContext';
import {ThemeProvider} from './src/shared/theme/ThemeContext';
import PresenceTracker from './src/features/activity/PresenceTracker';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PresenceTracker/>
        <AppNavigator/>
      </AuthProvider>
    </ThemeProvider>
  );
}
