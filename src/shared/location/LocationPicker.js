import React, {useEffect, useRef, useState} from 'react';
import {Text, TextInput, View} from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import {useTheme} from '../theme/ThemeContext';
import LocationMap from './LocationMap';
import {coordinateLabel, currentLocation, parseCoordinates, validCoordinates} from './location';

export default function LocationPicker({label, value, onChange, disabled = false, onBusyChange}) {
  const {theme} = useTheme();
  const [open, setOpen] = useState(false), [map, setMap] = useState(false), [candidate, setCandidate] = useState(null);
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0), mounted = useRef(true), lock = useRef(false), blocked = useRef(disabled), busyCallback = useRef(onBusyChange);
  blocked.current = disabled; busyCallback.current = onBusyChange;
  useEffect(() => {mounted.current = true;return () => {mounted.current = false;generation.current++;busyCallback.current?.(false);};}, []);
  function preview(next) {setCandidate(next);setLatitude(String(next?.latitude ?? ''));setLongitude(String(next?.longitude ?? ''));setError('');}
  function edit() {if (disabled || busy) return;preview(validCoordinates(value));setOpen(true);setMap(false);}
  async function locate() {
    if (blocked.current || lock.current) return;
    const attempt = ++generation.current;
    lock.current = true;setBusy(true);busyCallback.current?.(true);setError('');
    try {const next = await currentLocation();if (mounted.current && attempt === generation.current && !blocked.current) {preview(next);setMap(false);}}
    catch (e) {if (mounted.current && attempt === generation.current) setError(e.message || 'Location unavailable. Choose a map pin or enter coordinates.');}
    finally {lock.current = false;if (mounted.current) {setBusy(false);busyCallback.current?.(false);}}
  }
  const inactive = disabled || busy;
  const styles = {input: {borderWidth: 1, borderColor: theme.border, color: theme.textPrimary, borderRadius: 10, padding: 12}, text: {color: theme.textPrimary}};
  return <View style={{gap: 10}}>
    <Text style={styles.text}>{label}</Text>
    <Text style={styles.text}>{coordinateLabel(value)}</Text>
    <Text style={styles.text}>Used for straight-line quotation distances in kilometres, not travel distance. Addresses and city names stay unchanged.</Text>
    {!open && <PrimaryButton title={`Choose ${label.toLowerCase()}`} disabled={inactive} onPress={edit}/>}
    {open && <>
      <PrimaryButton title="Use current location" disabled={inactive} onPress={locate}/>
      <PrimaryButton title="Choose on map" disabled={inactive} onPress={() => {if (!inactive) setMap(true);}}/>
      {map && <>
        <Text style={styles.text}>Tap to place a pin, or drag it. The initial map overview is not a selected location. Map loading contacts OpenStreetMap and the Leaflet CDN.</Text>
        <LocationMap initialValue={candidate} disabled={inactive} onSelect={next => {if (!inactive) preview(next);}}/>
      </>}
      <Text style={styles.text}>Or enter precise coordinates:</Text>
      <TextInput accessibilityLabel={`${label} latitude`} placeholder="Latitude (-90 to 90)" value={latitude} editable={!inactive} onChangeText={text => {setLatitude(text);setCandidate(null);}} autoCapitalize="none" style={styles.input}/>
      <TextInput accessibilityLabel={`${label} longitude`} placeholder="Longitude (-180 to 180)" value={longitude} editable={!inactive} onChangeText={text => {setLongitude(text);setCandidate(null);}} autoCapitalize="none" style={styles.input}/>
      <PrimaryButton title="Preview coordinates" disabled={inactive} onPress={() => {if (inactive) return;const next = parseCoordinates(latitude, longitude);if (!next) setError('Enter a latitude from -90 to 90 and a longitude from -180 to 180.');else {preview(next);setMap(false);}}}/>
      <Text style={styles.text}>Location to confirm: {coordinateLabel(candidate)}</Text>
      {!!error && <Text accessibilityRole="alert" style={{color: theme.error}}>{error}</Text>}
      <PrimaryButton title="Confirm selected location" disabled={inactive || !candidate} onPress={() => {if (!inactive && candidate) {onChange(candidate);setOpen(false);setMap(false);}}}/>
      <PrimaryButton title="Cancel location selection" disabled={busy} onPress={() => {if (!busy) {generation.current++;setOpen(false);setMap(false);}}}/>
    </>}
    {!!validCoordinates(value) && !open && <PrimaryButton title={`Remove ${label.toLowerCase()}`} disabled={inactive} onPress={() => {if (!inactive) onChange(null);}}/>}
  </View>;
}
