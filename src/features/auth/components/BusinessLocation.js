import React, {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useAuth} from '../context/AuthContext';
import {apiRequest} from '../../../shared/services/api';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import LocationPicker from '../../../shared/location/LocationPicker';
import {validCoordinates} from '../../../shared/location/location';
import {useTheme} from '../../../shared/theme/ThemeContext';

export default function BusinessLocation({disabled = false, onBusyChange}) {
  const {user, profile, refresh, offline} = useAuth(), {theme} = useTheme();
  return <BusinessLocationDraft key={user?.uid} uid={user?.uid} saved={profile?.shop?.coordinates} refresh={refresh} disabled={disabled || offline} onBusyChange={onBusyChange} theme={theme}/>;
}
function BusinessLocationDraft({uid, saved, refresh, disabled, onBusyChange, theme}) {
  const initial = validCoordinates(saved);
  const [value, setValue] = useState(initial), [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [locating, setLocating] = useState(false), [message, setMessage] = useState('');
  const baseline = useRef(initial), pending = useRef(null), lock = useRef(false), mounted = useRef(true), blocked = useRef(disabled), callback = useRef(onBusyChange);
  blocked.current = disabled;callback.current = onBusyChange;
  useEffect(() => {mounted.current = true;return () => {mounted.current = false;callback.current?.(false);};}, []);
  useEffect(() => {if (!dirty) {baseline.current = validCoordinates(saved);setValue(baseline.current);}}, [saved?.latitude, saved?.longitude]);
  async function save() {
    if (!uid || blocked.current || lock.current || locating || !dirty) return;
    lock.current = true;setSaving(true);callback.current?.(true);setMessage('');
    // Keep the retry key after a lost acknowledgement; a new selection creates a new key.
    if (!pending.current) pending.current = `location_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const result = await apiRequest('profile', {op: 'shopLocationSave', coordinates: value, expectedCoordinates: baseline.current, requestId: pending.current}, {expectedUid: uid});
      if (!mounted.current) return;
      baseline.current = result.coordinates;pending.current = null;setDirty(false);
      // Refresh while keeping the draft, so an old cached profile cannot replace a successful save.
      try {await refresh();if (mounted.current) {setDirty(false);setMessage('Business location saved. Quotation distances update when customers refresh their quotations.');}}
      catch {if (mounted.current) setMessage('Business location saved. Refresh your account to load the saved profile.');}
    } catch (e) {if (mounted.current) setMessage(e.message || 'Unable to save your business location.');}
    finally {lock.current = false;if (mounted.current) {setSaving(false);callback.current?.(false);}}
  }
  async function reloadSaved() {
    if (blocked.current || lock.current || locating) return;
    lock.current = true;setSaving(true);callback.current?.(true);
    baseline.current = validCoordinates(saved);setValue(baseline.current);setDirty(false);pending.current = null;setMessage('');
    try {await refresh();if (mounted.current) setMessage('Saved business location reloaded.');}
    catch {if (mounted.current) setMessage('Unable to refresh the saved location. Try reloading again.');}
    finally {lock.current = false;if (mounted.current) {setSaving(false);callback.current?.(false);}}
  }
  return <View style={{gap: 12}}>
    <LocationPicker label="Business Location" value={value} disabled={disabled || saving} onBusyChange={next => {setLocating(next);callback.current?.(next);}} onChange={next => {if (!disabled && !saving) {setValue(next);setDirty(true);pending.current = null;setMessage('Review the selected coordinates, then save your business location.');}}}/>
    <PrimaryButton title="Save business location" disabled={disabled || saving || locating || !dirty} onPress={save}/>
    <PrimaryButton title="Reload saved business location" disabled={disabled || saving || locating} onPress={reloadSaved}/>
    {!!message && <Text accessibilityLiveRegion="polite" style={{color: theme.textPrimary}}>{message}</Text>}
  </View>;
}
