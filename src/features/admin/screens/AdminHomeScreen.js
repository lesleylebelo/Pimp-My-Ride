import React from 'react';
import {Text, View, useWindowDimensions} from 'react-native';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAdminData} from '../services/useAdminData';
import {Page, Card, Button, Notice, useAdminStyles} from '../components/AdminUI';
export default function AdminHomeScreen({navigation}) {
  const {data, busy, error, refresh} = useAdminData('dashboard'), styles = useAdminStyles(), {theme} = useTheme(), {width} = useWindowDimensions();
  const metrics = [
    ['Total accounts', 'accounts', 'AdminAccounts', 'all'], ['Pending applications', 'pending', 'AdminAccounts', 'pending'],
    ['Suspended accounts', 'suspended', 'AdminAccounts', 'suspended'], ['Active categories', 'categories', 'AdminCategories'],
  ];
  return <Page>
    <View style={[styles.row, {justifyContent: 'space-between'}]}><Text style={styles.muted}>Your administration workspace at a glance.</Text><Button title="Refresh" disabled={busy} onPress={refresh}/></View>
    <Notice busy={busy} error={error}/>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 14}}>
      {metrics.map(([label, key, route, filter]) => <Card key={key} style={{flexGrow: 1, flexBasis: width >= 1200 ? '22%' : width >= 600 ? '45%' : '100%'}}>
        <Text style={styles.muted}>{label}</Text><Text style={{fontSize: 32, fontWeight: '700', color: theme.textPrimary}}>{busy ? '…' : Number.isFinite(data?.[key]) ? data[key].toLocaleString() : '—'}</Text>
        <Button title={key === 'pending' ? 'Review applications' : 'View details'} disabled={!data || busy} onPress={() => navigation.navigate(route, filter ? {filter} : undefined)}/>
      </Card>)}
    </View>
    <Card><Text style={styles.heading}>Requires attention</Text>
      {busy ? <Text style={styles.muted}>Checking applications…</Text> : !Number.isFinite(data?.pending) ? <Text style={styles.muted}>Application totals are unavailable. Refresh to try again.</Text> : data.pending > 0 ? <><Text style={styles.muted}>{data.pending} workshop {data.pending === 1 ? 'application is' : 'applications are'} awaiting review.</Text><View style={styles.row}><Button title="Review applications" primary onPress={() => navigation.navigate('AdminAccounts', {filter: 'pending'})}/></View></> : <Text style={styles.muted}>No workshop applications awaiting review.</Text>}
    </Card>
    <View style={styles.row}><Text style={styles.heading}>Quick access</Text><Button title="Online status" onPress={() => navigation.navigate('AdminPresence')}/><Button title="Activity log" onPress={() => navigation.navigate('AdminAudit')}/></View>
  </Page>;
}
