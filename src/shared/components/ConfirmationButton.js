import {CustomerModal as Modal,CustomerAction,useCustomerExperience} from '../../features/customer/components/CustomerUI';
import {useTheme} from '../theme/ThemeContext';
import React, {useRef, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import PrimaryButton from './PrimaryButton';
import OutlineButton from './OutlineButton';
import colors from '../theme/colors';

export default function ConfirmationButton({title, message, onConfirm, disabled, danger, palette, presentation}) {
  const {theme}=useTheme(),owner=useCustomerExperience(),customer=owner||presentation==='feed';
  const styles = makeStyles(customer?theme:palette || colors);
  const normalText = palette ? {color: '#101208'} : undefined;
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
  const Action=customer?CustomerAction:PrimaryButton;
  const CancelAction=presentation==='feed'?CustomerAction:OutlineButton;
  return <>
    <Action primary danger={danger}
      title={title}
      disabled={disabled || busy}
      style={danger&&!customer ? styles.dangerButton : undefined}
      textStyle={danger ? styles.dangerText : normalText}
      onPress={() => { setError(''); setVisible(true); }}
    />
    <Modal visible={visible} transparent animationType={presentation==='feed'?'none':'fade'} onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Action primary danger={danger}
            title="Confirm"
            onPress={confirm}
            loading={busy}
            disabled={disabled}
            style={danger&&!customer ? styles.dangerButton : undefined}
            textStyle={danger ? styles.dangerText : normalText}
          />
          <CancelAction title="Cancel" onPress={cancel} disabled={busy} />
        </View>
      </View>
    </Modal>
  </>;
}

const makeStyles = colors => StyleSheet.create({
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
