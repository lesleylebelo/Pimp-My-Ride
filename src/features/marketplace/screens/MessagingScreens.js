import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useMessages} from '../hooks/useMessages';
import {messageApi} from '../services/messageApi';
import {MessagingFrame, MessageAction, MessageEmpty, MessageFeedback, activityTime, conversationLabel, messageDate, messageTime, useMessagingStyles} from '../components/MessagingUI';

export function MessagesScreen(props) {const {user} = useAuth(); return <Inbox key={user?.uid} {...props}/>;}
function Inbox({navigation}) {
  const {offline, profile} = useAuth(), feed = useMessages(), focused = useIsFocused(), {styles, theme} = useMessagingStyles();
  const opening = useRef(false);
  useEffect(() => {if (focused) opening.current = false;}, [focused]);
  const error = offline ? 'Connect to view messages.' : feed.error;
  function open(item) {
    if (offline || !focused || opening.current) return;
    opening.current = true; navigation.navigate('Chat', {id: item.id});
  }
  return <MessagingFrame title="Messages" subtitle="Private conversations about your requests" navigation={navigation} role={profile?.role}>
    <FlatList testID="messages-inbox" style={styles.list} contentContainerStyle={styles.listContent}
      data={offline ? [] : feed.items} keyExtractor={item => item.id} initialNumToRender={14} maxToRenderPerBatch={14} windowSize={7}
      refreshing={feed.busy && !!feed.items.length} onRefresh={() => {if (!offline && !feed.busy) void feed.refresh();}}
      onEndReached={() => {if (!offline && !feed.busy && !feed.error && feed.cursor) void feed.loadMore();}} onEndReachedThreshold={.3}
      ListHeaderComponent={<MessageFeedback error={error} busy={feed.busy && !feed.items.length && !offline} loading="Loading conversations..."/>}
      renderItem={({item}) => {
        const name = conversationLabel(item, profile?.role), unread = item.unreadCount > 0;
        const status = item.consent === 'pending' ? 'Awaiting customer approval' : item.canSend ? '' : 'Read-only history';
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open conversation: ${name}`}
          accessibilityHint={[item.requestTitle, status].filter(Boolean).join('. ')} accessibilityValue={{text: `${item.unreadCount || 0} unread messages`}} disabled={offline}
          onPress={() => open(item)} style={({pressed}) => [styles.inboxRow, pressed && styles.pressed]}>
          <View style={styles.avatar} accessible={false}><Ionicons name={profile?.role === 'shop' ? 'person-outline' : 'storefront-outline'} size={22} color={theme.textPrimary}/></View>
          <View style={styles.inboxCopy}>
            <View style={styles.inboxTop}><Text weight={unread ? 'semibold' : 'medium'} style={styles.name}>{name}</Text><Text style={styles.timestamp}>{activityTime(item.updatedAt)}</Text></View>
            {profile?.role !== 'shop' && !!item.requestTitle && <Text numberOfLines={2} style={styles.secondary}>{item.requestTitle}</Text>}
            {profile?.role === 'shop' && !!item.shopName && <Text style={styles.secondary}>Workshop: {item.shopName}</Text>}
            <Text numberOfLines={2} weight={unread ? 'semibold' : 'regular'} style={[styles.preview, unread && styles.unreadPreview]}>{item.lastMessage || item.enquiry || 'No messages yet.'}</Text>
            {!!status && <Text style={styles.secondary}>{status}</Text>}
          </View>
          {unread && <View testID={`conversation-unread-${item.id}`} style={styles.unreadBadge}><Text style={styles.unreadCount}>{item.unreadCount > 99 ? '99+' : String(item.unreadCount)}</Text></View>}
        </Pressable>;
      }}
      ListEmptyComponent={!feed.busy && !error ? <MessageEmpty inbox/> : null}
      ListFooterComponent={<View style={styles.footer}>
        {feed.busy && !!feed.items.length && <MessageFeedback busy loading="Updating conversations..."/>}
        {!!feed.cursor && <MessageAction title="Load more conversations" disabled={feed.busy || offline} onPress={() => {if (!feed.busy && !offline) void feed.loadMore();}}/>}
        <MessageAction title="Refresh messages" disabled={feed.busy || offline} onPress={() => {if (!feed.busy && !offline) void feed.refresh();}}/>
      </View>}/>
  </MessagingFrame>;
}

export function ChatScreen(props) {const {user} = useAuth(); return <Chat key={`${user?.uid}:${props.route.params.id}`} {...props}/>;}
function Chat({navigation, route}) {
  const {user, profile, offline} = useAuth(), focused = useIsFocused(), {styles, theme} = useMessagingStyles(), feed = useMessages(route.params.id);
  const [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [failure, setFailure] = useState(''), [working, setWorking] = useState(false);
  const [inputFocused, setInputFocused] = useState(false), [details, setDetails] = useState(false);
  const lock = useRef(false), active = useRef(true), retry = useRef(null), permission = useRef(false), caller = useRef(user?.uid), list = useRef(null), navigating = useRef(false);
  caller.current = user?.uid;
  const conversation = feed.data;
  permission.current = focused && !offline && !!conversation?.canSend && (!conversation.expiresAt || conversation.expiresAt > Date.now()) && !feed.error;
  useEffect(() => {active.current = true; return () => {active.current = false;};}, []);
  useEffect(() => {if (focused) navigating.current = false;}, [focused]);
  async function action(op, data) {
    if (lock.current || offline || !focused || AppState.currentState !== 'active') return;
    lock.current = true; setWorking(true); setFailure(''); const uid = caller.current;
    try {await messageApi(op, {id: route.params.id, ...data}); if (active.current && uid === caller.current) await feed.refresh();}
    catch (e) {if (active.current && uid === caller.current) setFailure(e.message || 'Unable to update the conversation.');}
    finally {lock.current = false; if (active.current && uid === caller.current) setWorking(false);}
  }
  async function send() {
    const text = draft.trim(); if (lock.current || !permission.current || !text || text.length > 2000 || AppState.currentState !== 'active') return;
    lock.current = true; setSending(true); setFailure(''); const uid = caller.current;
    if (!retry.current) retry.current = `send_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      await messageApi('send', {id: route.params.id, text, requestId: retry.current});
      if (active.current && uid === caller.current) {setDraft(''); retry.current = null; await feed.refresh(); if (active.current && uid === caller.current) list.current?.scrollToOffset({offset: 0, animated: true});}
    } catch (e) {if (active.current && uid === caller.current) setFailure(e.message || 'Message not sent. Retry to send the same message once.');}
    finally {lock.current = false; if (active.current && uid === caller.current) setSending(false);}
  }
  function navigate(name, id) {
    if (offline || !focused || navigating.current) return;
    navigating.current = true; setDetails(false); navigation.navigate(name, {id});
  }
  const readThrough = Math.max(0, ...feed.items.filter(item => item.senderId !== user?.uid).map(item => item.recipientOrdinal || 0));
  const rows = useMemo(() => [...feed.items].reverse(), [feed.items]);
  const error = offline ? 'Connect to view and send messages.' : feed.error || failure;
  const blocked = !permission.current || sending || working;
  const sendLabel = sending ? 'Sending message…' : failure && draft ? 'Retry message' : 'Send message';
  const status = conversation?.consent === 'pending' ? 'Awaiting customer approval' : permission.current ? 'Request conversation' : 'Read-only history';
  const conversationDetails = conversation && <View style={styles.contextDetails}>
      <MessageFeedback error={error} busy={working} loading="Updating conversation..."/>
      <Text style={styles.secondary}>Unread messages: {conversation.unreadCount || 0}</Text>
      {!!conversation.enquiry && <Text style={styles.secondary}>Communication enquiry: {conversation.enquiry}</Text>}
        {!!conversation.reason && <Text style={styles.secondary}>{conversation.reason}</Text>}
        <Text style={styles.secondary}>{[conversation.vehicle?.year, conversation.vehicle?.make, conversation.vehicle?.model].filter(Boolean).join(' ')}</Text>
        {!!conversation.bookingId && <MessageAction title="View related booking" disabled={offline} onPress={() => navigate('BookingDetail', conversation.bookingId)}/>}
      <View style={styles.actions}>
        {profile?.role === 'owner' && <>
          {(conversation.consent !== 'approved' || !conversation.canSend) && <MessageAction title="Approve communication" disabled={offline || working} onPress={() => action('consent', {decision: 'approved'})}/>}
          {conversation.consent === 'pending' && <MessageAction title="Reject enquiry" disabled={offline || working} onPress={() => action('consent', {decision: 'rejected'})}/>}
          {conversation.consent !== 'revoked' && conversation.consent !== 'rejected' && <MessageAction title="Revoke communication" disabled={offline || working} onPress={() => action('consent', {decision: 'revoked'})}/>}
        </>}
        {!!conversation.unreadCount && <MessageAction title="Mark displayed messages read" disabled={offline || working || !readThrough} onPress={() => action('read', {through: readThrough})}/>}
      </View>
      {!permission.current && <Text style={styles.secondary}>History is available, but new messages require current authorisation. An enquiry alone does not permit messaging.</Text>}
    </View>;
  const older = <View>
    {!!feed.cursor && <MessageAction title="Load older messages" disabled={offline || feed.busy} onPress={() => {if (!offline && !feed.busy) void feed.loadMore();}}/>}
    <MessageFeedback busy={(feed.busy || working) && !offline} loading={working || feed.items.length ? 'Updating conversation...' : 'Loading conversation...'}/>
    <MessageAction title="Refresh conversation" disabled={offline || feed.busy || sending || working} onPress={() => {if (!offline && !feed.busy && !sending && !working) void feed.refresh();}}/>
  </View>;
  return <MessagingFrame navigation={navigation} role={profile?.role} title={conversation ? conversationLabel(conversation, profile?.role) : 'Private conversation'} subtitle={conversation ? status : undefined} icon="chatbubble-ellipses-outline">
    <KeyboardAvoidingView testID="chat-keyboard-layout" style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      {conversation && <View style={styles.context}>
        <Pressable accessibilityRole="button" accessibilityLabel="View related request" accessibilityHint={conversation.requestTitle}
          disabled={offline} onPress={() => navigate(profile?.role === 'shop' ? 'ShopRequest' : 'OwnerRequest', conversation.serviceRequestId)}
          style={({pressed}) => [styles.contextLink, pressed && styles.pressed]}>
          <Ionicons name="construct-outline" size={18} color={theme.textSecondary}/>
          <View style={styles.contextCopy}><Text weight="semibold" style={styles.contextTitle}>{conversation.requestTitle}</Text><Text style={styles.hint}>Request: {conversation.serviceRequestId}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary}/>
        </Pressable>
        <View style={styles.actions}><MessageAction title="Conversation details" onPress={() => setDetails(true)}/>
          {!!conversation.unreadCount && <Text style={styles.secondary}>{conversation.unreadCount} unread</Text>}</View>
      </View>}
      <FlatList ref={list} testID="chat-messages" style={styles.list} contentContainerStyle={styles.listContent} inverted data={rows}
        keyExtractor={item => item.id} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={7}
        maintainVisibleContentPosition={{minIndexForVisible: 0, autoscrollToTopThreshold: 80}}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onEndReached={() => {if (!offline && !feed.busy && !feed.error && feed.cursor) void feed.loadMore();}} onEndReachedThreshold={.25}
        renderItem={({item, index}) => {
          const own = item.senderId === user?.uid, date = messageDate(item.createdAt);
          const startsDate = index === rows.length - 1 || messageDate(rows[index + 1].createdAt) !== date;
          return <View testID={`message-${item.id}`}>
            {startsDate && <Text accessibilityRole="header" style={styles.date}>{date}</Text>}
            <View style={[styles.message, own && styles.ownMessage]}><View testID={own ? 'outgoing-bubble' : 'incoming-bubble'} style={[styles.bubble, own && styles.ownBubble]}>
              <Text style={styles.messageText}>{item.text}</Text><Text style={styles.messageTime}>{own ? 'You' : 'Received'} · {messageTime(item.createdAt)}</Text>
            </View></View>
          </View>;
        }}
        ListEmptyComponent={!feed.busy && !error && conversation ? <MessageEmpty/> : null} ListFooterComponent={older}/>
      <View style={styles.composerPanel}>
        <MessageFeedback error={error}/>
        {conversation && <>
          <View style={styles.composer}>
            <TextInput accessibilityLabel="Message" accessibilityHint={Platform.OS === 'web' ? 'Enter to send. Shift+Enter for a new line.' : 'Message for this service request'}
              placeholder={permission.current ? 'Write a message…' : 'Messaging unavailable'} placeholderTextColor={theme.textSecondary}
              value={draft} onChangeText={text => {if (!lock.current) {setDraft(text); retry.current = null;}}} multiline maxLength={2000} editable={!blocked}
              onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)}
              onKeyPress={event => {const key = event.nativeEvent; if (Platform.OS === 'web' && key.key === 'Enter' && !key.shiftKey && !key.isComposing && key.keyCode !== 229 && !event.isComposing) {event.preventDefault?.(); void send();}}}
              style={[styles.input, inputFocused && styles.inputFocused]}/>
            <Pressable accessibilityRole="button" accessibilityLabel={sendLabel} accessibilityState={{disabled: blocked || !draft.trim(), busy: sending}}
              disabled={blocked || !draft.trim()} onPress={send} style={({pressed}) => [styles.send, (blocked || !draft.trim()) && styles.sendDisabled, pressed && styles.pressed]}>
              <Ionicons name={failure && draft ? 'refresh-outline' : 'send'} size={21} color={blocked || !draft.trim() ? theme.textSecondary : '#101208'}/>
            </Pressable>
          </View>
          <Text style={styles.hint}>{draft.length}/2000 characters. Chat does not change quotations, bookings or payments.</Text>
        </>}
      </View>
    </KeyboardAvoidingView>
    <Modal visible={details} transparent animationType="fade" onRequestClose={() => setDetails(false)}>
      <View style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modalPanel}>
        <View style={styles.modalHeader}><Text accessibilityRole="header" weight="semibold" style={styles.contextTitle}>Conversation details</Text><MessageAction title="Close details" onPress={() => setDetails(false)}/></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>{conversationDetails}</ScrollView>
      </View></View>
    </Modal>
  </MessagingFrame>;
}
