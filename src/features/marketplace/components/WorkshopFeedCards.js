import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {CustomerAction as Action, CustomerCard as Card, CustomerPressable as Interaction, CustomerText as Text} from '../../customer/components/CustomerUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import ShowcasePhoto from './ShowcasePhoto';
import RequestPhotos from './RequestPhotos';
import {formatMoney} from './MarketplaceUI';

export function WorkshopFeedColumn({children}) {
  return <View style={styles.column}>{children}</View>;
}

function Identity({children, onPress, label}) {
  return onPress ? <Interaction accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.identity}>{children}</Interaction> : <View style={styles.identity}>{children}</View>;
}

export function WorkshopRequestCard({request, disabled, onOpen, time}) {
  const vehicle = [request.vehicle?.year, request.vehicle?.make, request.vehicle?.model].filter(Boolean).join(' ');
  return <Card style={styles.card}>
    <Identity>
      <ProfileAvatar context="request" id={request.id} revision={request.customerAvatar?.revision} enabled={!!request.customerAvatar?.hasPhoto && !!request.customerName && request.customerName !== 'Customer'} size={40} label="Customer profile photo"/>
      <View style={styles.copy}><Text style={styles.name}>{request.customerName || 'Customer'}</Text><Text muted style={styles.meta}>{[request.city, time].filter(Boolean).join(' · ')}</Text></View>
    </Identity>
    <Text muted style={styles.meta}>{['Service request', request.categoryName].filter(Boolean).join(' / ')}</Text>
    <Text heading>{request.title || request.categoryName || 'Service request'}</Text>
    {!!request.description && <Text muted>{request.description}</Text>}
    <Text style={styles.vehicle}>{vehicle || 'Vehicle details not provided'}</Text>
    <Text muted>{request.budgetMinCents == null && request.budgetMaxCents == null ? 'Budget not specified' : `${request.budgetMinCents == null ? 'No minimum' : formatMoney(request.budgetMinCents)} – ${request.budgetMaxCents == null ? 'No maximum' : formatMoney(request.budgetMaxCents)}`}</Text>
    <RequestPhotos request={request} presentation="feed"/>
    <View style={styles.footer}>
      <Action title={`${request.quotedByMe ? 'View your quote' : 'View request'}: ${request.title || request.categoryName || 'Service request'}`} displayTitle={request.quotedByMe ? 'View your quote' : 'View request'} disabled={disabled} onPress={onOpen}/>
      <View style={styles.status}><Text muted style={styles.meta}>{({open:'Open',closed:'Closed',accepted:'Accepted'})[request.status] || 'Status unavailable'}</Text>{request.quotedByMe && <Text muted style={styles.meta}>Quoted</Text>}{Number.isSafeInteger(request.quotationCount) && <Text muted style={styles.meta}>{request.quotationCount===0?'No quotes yet':`${request.quotationCount} ${request.quotationCount===1?'quote':'quotes'}`}</Text>}</View>
    </View>
  </Card>;
}

export function WorkshopShowcaseCard({post, photos, author, place, time, vehicle, onOpen, onProfile, saved, busy, offline, error, message, onToggleSaved, management}) {
  const {theme} = useTheme();
  return <Card style={styles.card}>
    <Identity onPress={onProfile} label={`View workshop: ${author}`}>
      <ProfileAvatar context={post.shop?.id ? 'shop' : 'post'} id={post.shop?.id || post.id} revision={post.authorPhotoRevision ?? post.shop?.profilePhotoRevision} shop size={40}/>
      <View style={styles.copy}><Text style={styles.name}>{author}</Text><Text muted style={styles.meta}>{[place, time].filter(Boolean).join(' · ')}</Text>{(post.verificationStatus === 'approved' || post.shop?.verificationStatus === 'approved') && <Text style={styles.meta}>Verified workshop</Text>}</View>
    </Identity>
    <Interaction accessibilityRole="button" accessibilityLabel={`View ${post.title}`} onPress={onOpen} style={styles.copy}>
      <Text muted style={styles.meta}>{['SHOWCASE', post.serviceCategory || post.category].filter(Boolean).join(' / ')}</Text>
      <Text heading>{post.title}</Text>
      {!!post.description && <Text muted>{post.description}</Text>}
      {!!vehicle && <Text style={styles.vehicle}>{vehicle}</Text>}
    </Interaction>
    <View style={[styles.media, {backgroundColor: theme.surfaceMuted}]}>{photos.length ? <ShowcasePhoto postId={post.id} image={photos[0]} style={styles.image}/> : <View style={styles.placeholder}><Ionicons name="images-outline" size={28} color={theme.textSecondary}/><Text muted>No project photo available</Text></View>}</View>
    <View style={styles.footer}>
      <Action title="View showcase" onPress={onOpen}/>
      <Action title={saved ? 'Unsave post' : 'Save post'} icon={saved ? 'bookmark' : 'bookmark-outline'} iconOnly loading={busy} disabled={offline || busy} accessibilityState={{selected: saved}} onPress={event => {event?.stopPropagation?.(); void onToggleSaved();}}/>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{color: theme.error}}>{error}</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" muted>{message}</Text>}
    {management}
  </Card>;
}

const styles = StyleSheet.create({
  column: {width: '100%', maxWidth: 680, alignSelf: 'center', gap: 24},
  card: {padding: 16, gap: 14},
  identity: {flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8},
  copy: {flexShrink: 1, minWidth: 0, gap: 8},
  name: {fontWeight: '600'},
  meta: {fontSize: 12, lineHeight: 18},
  vehicle: {fontSize: 13, lineHeight: 20},
  media: {borderRadius: 12, overflow: 'hidden'},
  image: {width: '100%', aspectRatio: 4 / 3},
  placeholder: {aspectRatio: 4 / 3, justifyContent: 'center', alignItems: 'center', gap: 8},
  footer: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'},
  status: {gap: 3, alignItems: 'flex-end'},
});
