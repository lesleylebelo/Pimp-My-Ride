import {useCallback, useEffect, useRef, useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';

function mergePage(previous, incoming, replace) {
  const known = new Map(previous.map(item => [item.id, item]));
  const result = replace ? [] : [...previous];
  const positions = new Map(result.map((item, index) => [item.id, index]));
  // Pages already have Firestore's full-precision timestamp / ID ordering.
  // Never re-sort the API's millisecond timestamps or append to an old chain
  // after a first-page refresh: either can contradict that ordering.
  for (const item of incoming) {
    const value = {...item, readAt: item.readAt ?? known.get(item.id)?.readAt ?? null};
    const index = positions.get(item.id);
    if (index === undefined) {
      positions.set(item.id, result.length);
      result.push(value);
    } else {
      result[index] = {...value, readAt: value.readAt ?? result[index].readAt};
    }
  }
  return result;
}

export function useNotificationHistory() {
  const {user, offline} = useAuth(), uid = user?.uid, focused = useIsFocused();
  const [state, setState] = useState({items: [], cursor: null, busy: true, refreshing: true, error: ''});
  const active = useRef(false), generation = useRef(0);
  const paging = useRef({cursor: null, pending: false});
  useEffect(() => {
    active.current = true;
    return () => {active.current = false; ++generation.current;};
  }, []);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!uid || offline || !focused) {
      paging.current.pending = false;
      setState(value => ({...value, busy: false, refreshing: false, error: offline ? 'Connect to view your notifications.' : !uid ? 'Sign in to continue.' : ''}));
      return;
    }
    // Invalidate any older page immediately, even if its response arrives
    // before React renders the refresh. Keep the last valid page on failure.
    paging.current.pending = true;
    setState(value => ({...value, busy: true, refreshing: true, error: ''}));
    try {
      const data = await marketApi('notifications', {cursor: null});
      if (!active.current || current !== generation.current) return;
      if (!Array.isArray(data?.items)) throw new Error('Unable to load notification history. Please refresh.');
      paging.current = {cursor: data.cursor || null, pending: false};
      setState(value => ({items: mergePage(value.items, data.items, true), cursor: data.cursor || null, busy: false, refreshing: false, error: ''}));
    } catch (error) {
      if (!active.current || current !== generation.current) return;
      paging.current.pending = false;
      setState(value => ({...value, busy: false, refreshing: false, error: error?.message || 'Unable to load notifications. Please retry.'}));
    }
  }, [uid, offline, focused]);

  useEffect(() => {
    void refresh();
    return () => {++generation.current; paging.current.pending = false;};
  }, [refresh]);

  const loadNext = useCallback(async () => {
    const cursor = paging.current.cursor;
    if (!uid || offline || !focused || !cursor || paging.current.pending) return;
    const current = generation.current;
    paging.current.pending = true;
    setState(value => ({...value, busy: true, error: ''}));
    try {
      const data = await marketApi('notifications', {cursor});
      if (!active.current || current !== generation.current) return;
      if (!Array.isArray(data?.items)) throw new Error('Unable to load notification history. Please refresh.');
      paging.current = {cursor: data.cursor || null, pending: false};
      setState(value => ({items: mergePage(value.items, data.items, false), cursor: data.cursor || null, busy: false, refreshing: false, error: ''}));
    } catch (error) {
      if (!active.current || current !== generation.current) return;
      paging.current.pending = false;
      setState(value => ({...value, busy: false, error: error?.message || 'Unable to load more notifications. Please retry.'}));
    }
  }, [uid, offline, focused]);
  return {...state, refresh, loadNext};
}
