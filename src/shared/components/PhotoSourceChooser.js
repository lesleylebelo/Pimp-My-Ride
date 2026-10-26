import React, {useEffect, useRef, useState} from 'react';
import {Linking, Modal, Platform, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import {CustomerAction} from '../../features/customer/components/CustomerUI';
import {useTheme} from '../theme/ThemeContext';
import {launchPhotoSource, photoSourceError} from '../services/photoSource';

export function PhotoSourceDialog({visible, busy, error, settings, onSource, onCancel, onSettings, restoreFocus}) {
  const {theme} = useTheme(), {width} = useWindowDimensions(), panel = useRef(null), cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = restoreFocus || document.activeElement;
    const controls = () => Array.from(panel.current?.querySelectorAll?.('button,[role="button"],[tabindex="0"]') || []).filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length);
    const timer = setTimeout(() => controls()[0]?.focus(), 0);
    const keydown = event => {
      if (event.key === 'Escape') {event.preventDefault(); cancel.current();}
      if (event.key === 'Tab') {
        const list = controls(), index = list.indexOf(document.activeElement);
        if (list.length && (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === list.length - 1))) {
          event.preventDefault(); list[event.shiftKey ? list.length - 1 : 0].focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      clearTimeout(timer); document.removeEventListener('keydown', keydown);
      // RN Web's Modal also restores focus during teardown. Run afterwards,
      // once the invoking upload button has been re-enabled by its picker task.
      setTimeout(() => {if (!document.querySelector('[role="dialog"][aria-label="Choose a photo source"]')) previous?.focus?.();}, 0);
    };
  }, [visible]);
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
    <SafeAreaView style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: width < 600 ? 'flex-end' : 'center', padding: 16}}>
      <View ref={panel} accessibilityViewIsModal {...(Platform.OS === 'web' ? {role: 'dialog', 'aria-modal': true, 'aria-label': 'Choose a photo source'} : {})} style={{width: '100%', maxWidth: 440, maxHeight: '100%', alignSelf: 'center', borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceCard}}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 20, gap: 14}}>
          <Text accessibilityRole="header" style={{color: theme.textPrimary, fontSize: 20, fontWeight: '600'}}>Choose a photo source</Text>
          {Platform.OS === 'web' && <Text style={{color: theme.textSecondary, lineHeight: 21}}>Your browser may open a camera or a file picker. If capture is unavailable, choose an existing photo from your gallery.</Text>}
          {!!error && <Text accessibilityRole="alert" style={{color: theme.error, lineHeight: 22}}>{error}</Text>}
          {busy && <Text accessibilityRole="status" style={{color: theme.textSecondary}}>Waiting for your photo…</Text>}
          <CustomerAction title="Take photo" icon="camera-outline" disabled={busy} onPress={() => onSource('camera')}/>
          <CustomerAction title="Choose from gallery" icon="images-outline" disabled={busy} onPress={() => onSource('gallery')}/>
          {settings && <CustomerAction title="Open settings" icon="settings-outline" disabled={busy} onPress={onSettings}/>}
          <CustomerAction title="Cancel" onPress={onCancel}/>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

export function usePhotoSource({scopeKey, enabled = true} = {}) {
  const focused = useIsFocused(), request = useRef(null), context = useRef(null), opener = useRef(null), [state, setState] = useState(null);
  context.current = {scopeKey, enabled, focused};
  function finish(value) {
    const pending = request.current; request.current = null;
    setState(null); pending?.resolve(value);
  }
  useEffect(() => {return () => {const pending = request.current; request.current = null; pending?.resolve({canceled: true, assets: []});};}, []);
  useEffect(() => {finish({canceled: true, assets: []});}, [scopeKey, enabled, focused]);
  function choose(options = {}) {
    if (!context.current.enabled || !context.current.focused || request.current) return Promise.resolve({canceled: true, assets: []});
    return new Promise(resolve => {
      opener.current = Platform.OS === 'web' && typeof document !== 'undefined' ? document.activeElement : null;
      request.current = {resolve, options, scopeKey};
      setState({busy: false, error: '', settings: false});
    });
  }
  function select(source) {
    const pending = request.current;
    if (!pending || pending.busy || !context.current.enabled || !context.current.focused || context.current.scopeKey !== pending.scopeKey) return;
    pending.busy = true; setState({busy: true, error: '', settings: false});
    // This function invokes the installed picker before its first promise/await.
    let result;
    try {result = launchPhotoSource(source, pending.options);} catch (error) {failed(error); return;}
    Promise.resolve(result).then(value => {
      if (request.current === pending) finish({...value, source});
    }, failed);
    function failed(error) {
      if (request.current !== pending) return;
      pending.busy = false;
      setState({busy: false, error: photoSourceError(error, source), settings: error?.code === 'CAMERA_SETTINGS' && Platform.OS !== 'web' && typeof Linking?.openSettings === 'function'});
    }
  }
  function openSettings() {
    Promise.resolve().then(() => Linking.openSettings()).catch(() => setState(current => current && {...current, error: 'Settings could not open. Open this app’s permissions in device settings, or choose from gallery.'}));
  }
  return {choose, chooser: <PhotoSourceDialog visible={!!state} busy={!!state?.busy} error={state?.error} settings={!!state?.settings} restoreFocus={opener.current} onSource={select} onSettings={openSettings} onCancel={() => finish({canceled: true, assets: []})}/>};
}
