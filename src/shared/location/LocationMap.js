import React, {useEffect, useRef, useState} from 'react';
import {Platform} from 'react-native';
import {mapDocument} from './mapDocument';
import {validCoordinates} from './location';

export default function LocationMap({initialValue, onSelect, disabled}) {
  const frame = useRef(null), select = useRef(onSelect), blocked = useRef(disabled);
  select.current = onSelect; blocked.current = disabled;
  const [html] = useState(() => mapDocument(initialValue));
  function receive(raw) {
    if (blocked.current) return;
    try {const data = JSON.parse(raw); const value = validCoordinates(data); if (data.type === 'pmr-location' && value) select.current(value);} catch {}
  }
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const listener = event => {if (event.source === frame.current?.contentWindow && event.origin === window.location.origin) receive(event.data);};
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  if (Platform.OS === 'web') return React.createElement('iframe', {ref: frame, title: 'Select location on map', srcDoc: html, sandbox: 'allow-scripts allow-same-origin allow-popups', style: {width: '100%', height: 320, border: 0}});
  const {WebView} = require('react-native-webview');
  return <WebView source={{html}} style={{height: 320, flex: 0}} originWhitelist={['about:blank']} userAgent="PimpMyRide/1.0 (location-selector)"
    javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false} geolocationEnabled={false}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank'} onMessage={event => receive(event.nativeEvent.data)}/>;
}
