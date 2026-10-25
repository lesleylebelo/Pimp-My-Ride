import React, {useRef, useState} from 'react';
import {View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, useWindowDimensions} from 'react-native';
import {useTheme} from '../../../shared/theme/ThemeContext';

export function useAdminStyles() {
  const {theme: t, isDark} = useTheme();
  return StyleSheet.create({
    page: {padding: 20, gap: 18, paddingBottom: 40, width: '100%', maxWidth: 1280, alignSelf: 'center'},
    title: {fontSize: 26, fontWeight: '700', color: t.textPrimary},
    card: {backgroundColor: t.surfaceCard, borderRadius: 12, padding: 20, gap: 14, borderWidth: 1, borderColor: t.border, minWidth: 0},
    heading: {fontSize: 17, fontWeight: '600', color: t.textPrimary},
    muted: {color: isDark ? '#ADAEB7' : '#595962', fontSize: 13, lineHeight: 20},
    row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
    input: {backgroundColor: t.surfaceCanvas, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, color: t.textPrimary, fontSize: 14, minHeight: 44},
    button: {backgroundColor: t.surfaceCard, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: t.border, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
    buttonPrimary: {backgroundColor: isDark ? t.primary : '#526E13', borderColor: isDark ? t.primary : '#526E13'},
    buttonText: {color: t.textPrimary, fontWeight: '600', fontSize: 13},
    buttonTextPrimary: {color: t.primaryText},
    danger: {backgroundColor: t.errorSurface, borderColor: t.error},
    dangerText: {color: t.error},
  });
}
export function Page({children, onScroll, onLayout, onContentSizeChange}) {
  const styles = useAdminStyles(), {theme} = useTheme();
  return <ScrollView style={{flex: 1, backgroundColor: theme.surfaceCanvas}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={onScroll ? 16 : undefined}>{children}</ScrollView>;
}
export function Card({children, style}) {const styles = useAdminStyles(); return <View style={[styles.card, style]}>{children}</View>;}
export function Button({title, onPress, disabled, danger, primary, selected, accessibilityLabel, style}) {
  const styles = useAdminStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{disabled: !!disabled, ...(selected !== undefined ? {selected} : {})}} disabled={!!disabled} onPress={onPress} style={({pressed, hovered, focused}) => [styles.button, primary && styles.buttonPrimary, danger && styles.danger, style, (pressed || hovered) && {opacity: 0.8}, focused && {outlineWidth: 2, outlineColor: styles.buttonText.color, outlineOffset: 2}, disabled && {opacity: 0.45}]}><Text style={[styles.buttonText, primary && styles.buttonTextPrimary, danger && styles.dangerText]}>{title}</Text></Pressable>;
}
export function Field({label, value, onChangeText, ...props}) {
  const styles = useAdminStyles();
  return <View style={{gap: 6, minWidth: 0}}><Text style={styles.muted}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value || ''} onChangeText={onChangeText} placeholderTextColor={styles.muted.color} {...props}/></View>;
}
export function Notice({error, busy, message}) {
  const {theme} = useTheme();
  return <>{busy && <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><ActivityIndicator color={theme.accent} accessibilityLabel="Loading"/><Text style={{color: theme.textSecondary}}>Loading…</Text></View>}{!!error && <Text accessibilityRole="alert" style={{color: theme.error, lineHeight: 21}}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={{color: theme.success, lineHeight: 21}}>{message}</Text>}</>;
}
export function Status({value, label}) {
  const {theme: t, isDark} = useTheme();
  const good = ['active', 'approved', 'Online recently'].includes(value), bad = ['suspended', 'rejected', 'archived'].includes(value);
  const color = good ? (isDark ? t.success : '#1F7048') : bad ? t.error : (isDark ? '#C5C5CE' : '#595962');
  return <View style={{alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: good ? t.successSurface : bad ? t.errorSurface : t.surfaceMuted}}><Text style={{fontSize: 12, fontWeight: '600', color}}>{label || value || 'Not recorded'}</Text></View>;
}
export function Empty({title, detail}) {const styles = useAdminStyles(); return <Card><Text style={styles.heading}>{title}</Text>{!!detail && <Text style={styles.muted}>{detail}</Text>}</Card>;}
export function DataRow({cells, action, header = false, actionWidth = 120}) {
  const {width} = useWindowDimensions(), {theme} = useTheme(), styles = useAdminStyles(), desktop = width >= 1000;
  if (header && !desktop) return null;
  return <View style={{flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: desktop ? 16 : 10, padding: header ? 12 : 16, borderBottomWidth: 1, borderColor: theme.border, backgroundColor: header ? theme.surfaceMuted : theme.surfaceCard, borderRadius: desktop ? 0 : 10}}>{cells.map((cell, index) => <View key={index} style={{flex: desktop ? (index === 0 ? 1.5 : 1) : undefined, minWidth: 0}}>{typeof cell === 'string' ? <Text selectable={!header} style={header ? styles.muted : index === 0 ? styles.heading : styles.muted}>{cell}</Text> : cell}</View>)}{!!action && <View style={{width: desktop ? actionWidth : undefined, alignSelf: desktop ? undefined : 'flex-start'}}>{action}</View>}</View>;
}
export function Detail({label, children}) {const styles = useAdminStyles(); return <View style={{gap: 4, minWidth: 0}}><Text style={styles.muted}>{label}</Text><Text selectable style={[styles.heading, {fontSize: 14}]}>{children || 'Not recorded'}</Text></View>;}
export function FormGrid({children}) {
  const {width} = useWindowDimensions();
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{React.Children.toArray(children).map((child,index)=><View key={child.key||index} style={{flexGrow:1,flexBasis:width>=1000?'45%':'100%',minWidth:0}}>{child}</View>)}</View>;
}
export function Disclosure({title = 'Technical details', children}) {
  const [open, setOpen] = useState(false), styles = useAdminStyles();
  return <View style={{gap: 10}}><Pressable accessibilityRole="button" accessibilityState={{expanded: open}} onPress={() => setOpen(!open)} style={{minHeight: 44, justifyContent: 'center'}}><Text style={styles.muted}>{open ? '−' : '+'} {title}</Text></Pressable>{open && children}</View>;
}
export function Dialog({visible, title, children, onClose, busy}) {
  const styles = useAdminStyles();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => !busy && onClose()}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20}}><View accessibilityViewIsModal style={[styles.card, {width: '100%', maxWidth: 560, maxHeight: '90%'}]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap: 16}}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{children}<Button title="Cancel" disabled={busy} onPress={onClose}/></ScrollView></View></KeyboardAvoidingView></Modal>;
}
export function ConfirmButton({title, message, onConfirm, disabled, danger}) {
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false), styles = useAdminStyles();
  async function confirm() {if (lock.current || disabled) return; lock.current = true; setBusy(true); setError(''); try {await onConfirm(); setVisible(false);} catch (e) {setError(e.message || 'Unable to complete this action. Please retry.');} finally {lock.current = false; setBusy(false);}}
  return <><Button title={title} danger={danger} disabled={disabled || busy} onPress={() => {setError(''); setVisible(true);}}/><Dialog visible={visible} title={title} busy={busy} onClose={() => {setVisible(false); setError('');}}><Text style={styles.muted}>{message}</Text><Notice error={error} busy={busy}/><Button title="Confirm" primary={!danger} danger={danger} disabled={disabled || busy} onPress={confirm}/></Dialog></>;
}
export const when = value => {if (value === null || value === undefined || value === '') return 'Not recorded'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();};
