import React, {useRef, useState} from 'react';
import {Modal, View, Text, StyleSheet} from 'react-native';
import PrimaryButton from './PrimaryButton';
import OutlineButton from './OutlineButton';
import colors from '../theme/colors';

export default function ConfirmationButton({title, message, onConfirm, disabled, danger}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const cancel = () => { if (!lock.current) { setVisible(false); setError(''); } };
  async function confirm() {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true); setError('');
    try { await onConfirm(); setVisible(false); }
    catch (e) { setError(e.message || 'Unable to complete this action. Please retry.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <PrimaryButton
      title={title}
      disabled={disabled || busy}
      style={danger ? styles.dangerButton : undefined}
      textStyle={danger ? styles.dangerText : undefined}
      onPress={() => { setError(''); setVisible(true); }}
    />
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <PrimaryButton
            title="Confirm"
            onPress={confirm}
            loading={busy}
            disabled={disabled}
            style={danger ? styles.dangerButton : undefined}
            textStyle={danger ? styles.dangerText : undefined}
          />
          <OutlineButton title="Cancel" onPress={cancel} disabled={busy} />
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: {flex:1,justifyContent:'center',alignItems:'center',padding:24,backgroundColor:'rgba(0,0,0,0.7)'},
  card: {width:'100%',maxWidth:440,padding:24,gap:18,borderRadius:20,backgroundColor:colors.surfaceCard},
  title: {fontSize:20,fontWeight:'600',color:colors.textPrimary},
  message: {fontSize:14,lineHeight:20,color:colors.textSecondary},
  error: {color:colors.error,fontSize:13},
  dangerButton: {
    backgroundColor: '#3A1414',
    borderColor: '#3A1414',
  },
  dangerText: {
    color: '#FF6B6B',
  },
});