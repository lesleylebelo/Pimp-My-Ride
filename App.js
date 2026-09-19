import PresenceTracker from './src/features/activity/PresenceTracker';
import React from 'react';
import {AuthProvider} from './src/features/auth/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
export default function App(){return <AuthProvider><PresenceTracker/><AppNavigator/></AuthProvider>;}
