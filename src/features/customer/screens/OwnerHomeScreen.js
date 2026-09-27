import React, {useMemo, useState} from 'react';
import {Image, Modal, Pressable, StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import colors from '../../../shared/theme/colors';
import {radius} from '../../../shared/theme/typography';
import {ownerRoutes} from '../../marketplace/components/MarketplaceUI';
import {useMarketData} from '../../marketplace/hooks/useMarketData';
import {LandingButton, LandingShell, LandingText, ownerTabs, ui, useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import AppTextInput from '../../../shared/components/AppTextInput';

const matches = (shop, query) => Object.values(shop).some(value => String(value || '').toLowerCase().includes(query));

export default function OwnerHomeScreen({navigation}) {
  const feedback = useLandingFeedback();
  const shopsPages = usePages();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const shops = useMarketData('shops', {cursor: shopsPages.cursor});
  const categories = useMarketData('categories');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleShops = useMemo(() => (shops.data?.items || []).filter(shop => {
    const services = String(shop.services || '').toLowerCase();
    return (!normalizedQuery || matches(shop, normalizedQuery)) &&
      (!category || services.includes(category.toLowerCase())) &&
      (!location || ((!location.city || shop.city === location.city) && (!location.province || shop.province === location.province)));
  }), [shops.data, normalizedQuery, category, location]);
  const locations = useMemo(() => {
    const seen = new Set();
    return (shops.data?.items || []).reduce((values, shop) => {
      if (!shop.city && !shop.province) return values;
      const key = `${shop.city || ''}|${shop.province || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        values.push({city: shop.city || '', province: shop.province || ''});
      }
      return values;
    }, []);
  }, [shops.data]);
  const provinces = useMemo(() => [...new Set((shops.data?.items || []).map(shop => shop.province).filter(Boolean))], [shops.data]);
  const cities = useMemo(() => [...new Set((shops.data?.items || []).map(shop => shop.city).filter(Boolean))], [shops.data]);
  const disabled = shops.busy || categories.busy;
  const soon = feedback.showFeature;

  return <LandingShell title="Discover" tabs={ownerTabs} activeTab="Discover" {...feedback} onTabPress={label => ownerRoutes[label] ? navigation.navigate(ownerRoutes[label]) : soon(label)}>
    <LandingButton title="Create service request" onPress={() => navigation.navigate('RequestForm')}/>
    <View style={styles.feedHeading}>
      <View>
        <LandingText weight="medium" style={styles.feedTitle}>Community builds</LandingText>
        <LandingText style={styles.caption}>Fresh ideas from the scene</LandingText>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.primary} accessibilityElementsHidden/>
    </View>
    <View style={[ui.card, styles.postCard]}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}><LandingText weight="medium" style={styles.avatarText}>jt</LandingText></View>
        <View style={styles.authorCopy}>
          <LandingText weight="medium" style={styles.authorName}>jordan t.</LandingText>
          <LandingText style={styles.caption}>nissan skyline · 2h</LandingText>
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} accessibilityElementsHidden/>
      </View>
      <Image source={require('../../../../assets/landing/discover.png')} accessibilityLabel="Example community build inspiration" resizeMode="cover" style={styles.buildImage}/>
      <LandingText weight="medium" style={styles.postTitle}>built for the long way home.</LandingText>
      <LandingText style={styles.postCopy}>A few thoughtful details can change the whole feel. Sharing this build for your next project inspiration.</LandingText>
      <View style={styles.engagementRow}>
        <View style={styles.engagementActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike community build' : 'Like community build'} accessibilityState={{selected: liked}} onPress={() => setLiked(value => !value)} style={styles.engagementButton}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.primary : colors.textSecondary}/>
            <LandingText style={[styles.metric, liked && styles.activeMetric]}>{liked ? '25' : '24'}</LandingText>
          </Pressable>
          <View style={styles.engagementButton} accessible accessibilityLabel="12 comments">
            <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary}/>
            <LandingText style={styles.metric}>12</LandingText>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove saved community build' : 'Save community build'} accessibilityState={{selected: saved}} onPress={() => setSaved(value => !value)} hitSlop={8}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? colors.primary : colors.textSecondary}/>
        </Pressable>
      </View>
    </View>
    <View style={styles.workshopHeading}>
      <LandingText weight="medium" style={styles.feedTitle}>Find your workshop</LandingText>
      <LandingText style={styles.caption}>Explore verified workshops and their services.</LandingText>
    </View>
    <LandingButton title={location ? `${location.city || location.province}⌄` : 'All locations⌄'} outline disabled={shops.busy} onPress={() => setLocationOpen(true)}/>
    <AppTextInput accessibilityLabel="Search workshops or services" label="Search workshops or services" value={query} onChangeText={setQuery} editable={!shops.busy}/>
    <LandingText weight="medium">Browse by service</LandingText>
    <View style={styles.categories}>
      <LandingButton title="All" outline={!!category} disabled={categories.busy} onPress={() => setCategory('')} style={styles.category}/>
      {(categories.data?.items || []).map(item => <LandingButton key={item.id} title={item.name} outline={category !== item.name} disabled={categories.busy} onPress={() => setCategory(item.name)} style={styles.category}/>)}
    </View>
    <LandingButton title="More filters" outline disabled={disabled} onPress={() => setMoreFiltersOpen(true)}/>
    <LandingText weight="medium">Workshop showcases</LandingText>
    {(shops.busy || categories.busy) && <LandingText accessibilityRole="status" style={ui.muted}>Loading approved workshops...</LandingText>}
    {!!(shops.error || categories.error) && <LandingText accessibilityRole="alert" style={ui.error}>{shops.error || categories.error}</LandingText>}
    {!shops.busy && !shops.error && !visibleShops.length && <LandingText style={ui.muted}>No approved workshops match your search.</LandingText>}
    {visibleShops.map(shop => {
      const isExpanded = expanded === shop.id;
      return <View key={shop.id} style={ui.card}>
        <LandingButton title={isExpanded ? `Hide ${shop.shopName}` : `View ${shop.shopName}`} outline={!isExpanded} onPress={() => setExpanded(isExpanded ? null : shop.id)} accessibilityHint="Expands shop details on this page"/>
        <View style={styles.shopHeading}>
          <LandingText weight="medium" style={styles.shopName}>{shop.shopName}</LandingText>
          {shop.verified && <View style={styles.verified}><Ionicons name="checkmark-circle-outline" size={16} color={colors.primary}/><LandingText style={styles.verifiedText}>Verified workshop</LandingText></View>}
        </View>
        <LandingText style={styles.caption}>{[shop.city, shop.province].filter(Boolean).join(' · ') || 'Location not provided'}</LandingText>
        {isExpanded && <View style={styles.details}>
          <LandingText weight="semibold">Shop details</LandingText>
          <LandingText>City: {shop.city || 'Not provided'}</LandingText>
          <LandingText>Province: {shop.province || 'Not provided'}</LandingText>
          <LandingText>Services: {shop.services || 'Not provided'}</LandingText>
          <LandingButton title="Close details" outline onPress={() => setExpanded(null)}/>
        </View>}
      </View>;
    })}
    <View style={styles.pagination}>
      <LandingButton title="First" outline disabled={disabled || shopsPages.number === 1} onPress={() => shopsPages.first()}/>
      <LandingButton title="Previous" outline disabled={disabled || shopsPages.number === 1} onPress={() => shopsPages.previous()}/>
      <LandingButton title="Next" outline disabled={disabled || !shops.data?.cursor} onPress={() => shopsPages.next(shops.data.cursor)}/>
    </View>
    <LandingText style={ui.muted}>Page {shopsPages.number}</LandingText>
    <Modal visible={locationOpen} transparent animationType="fade" onRequestClose={() => setLocationOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <LandingText accessibilityRole="header" weight="medium" style={styles.modalTitle}>Choose location</LandingText>
          <LandingButton title="All locations" outline={!!location} onPress={() => {setLocation(null); setLocationOpen(false);}}/>
          {locations.map(item => {
            const selected = location?.city === item.city && location?.province === item.province;
            return <LandingButton key={`${item.city}|${item.province}`} title={[item.city, item.province].filter(Boolean).join(' · ')} outline={!selected} onPress={() => {setLocation(item); setLocationOpen(false);}}/>;
          })}
          {!locations.length && <LandingText style={ui.muted}>No locations are available on this page.</LandingText>}
          <LandingButton title="Close" outline onPress={() => setLocationOpen(false)}/>
        </View>
      </View>
    </Modal>
    <Modal visible={moreFiltersOpen} transparent animationType="fade" onRequestClose={() => setMoreFiltersOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <LandingText accessibilityRole="header" weight="medium" style={styles.modalTitle}>More filters</LandingText>
          <LandingText weight="medium">Province</LandingText>
          <LandingButton title="All provinces" outline={!!location?.province} onPress={() => setLocation(previous => previous?.city ? {city: previous.city, province: ''} : null)}/>
          {provinces.map(province => <LandingButton key={province} title={province} outline={location?.province !== province} onPress={() => setLocation({province, city: ''})}/>)}
          <LandingText weight="medium">City</LandingText>
          <LandingButton title="All cities" outline={!!location?.city} onPress={() => setLocation(previous => previous?.province ? {province: previous.province, city: ''} : null)}/>
          {cities.map(city => <LandingButton key={city} title={city} outline={location?.city !== city} onPress={() => {
            const match = (shops.data?.items || []).find(shop => shop.city === city);
            setLocation({city, province: match?.province || ''});
          }}/>)}
          <LandingText weight="medium">Category / service</LandingText>
          <LandingButton title="All categories" outline={!category} onPress={() => setCategory('')}/>
          {(categories.data?.items || []).map(item => <LandingButton key={item.id} title={item.name} outline={category !== item.name} onPress={() => setCategory(item.name)}/>)}
          <LandingButton title="Close" outline onPress={() => setMoreFiltersOpen(false)}/>
        </View>
      </View>
    </Modal>
  </LandingShell>;
}

function usePages() {
  const [history, setHistory] = useState([null]);
  return {
    cursor: history[history.length - 1],
    number: history.length,
    next: cursor => cursor && setHistory(value => value[value.length - 1] === cursor ? value : [...value, cursor]),
    previous: () => setHistory(value => value.length > 1 ? value.slice(0, -1) : value),
    first: () => setHistory([null]),
  };
}

const styles = StyleSheet.create({
  feedHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8},
  feedTitle: {fontSize: 20, lineHeight: 28},
  postCard: {padding: 14, gap: 12},
  authorRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandGreenLight, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 14, color: colors.primary},
  authorCopy: {flex: 1, gap: 1},
  authorName: {fontSize: 14},
  postTitle: {fontSize: 17, lineHeight: 24},
  postCopy: {fontSize: 14, lineHeight: 21, color: colors.textSecondary},
  engagementRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4},
  engagementActions: {flexDirection: 'row', alignItems: 'center', gap: 20},
  engagementButton: {minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6},
  metric: {fontSize: 12, color: colors.textSecondary},
  activeMetric: {color: colors.primary},
  workshopHeading: {gap: 2, paddingTop: 12},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  category: {flexGrow: 1, width: undefined, paddingHorizontal: 12, borderRadius: radius.pill},
  buildImage: {width: '100%', height: 220, borderRadius: 16, backgroundColor: colors.border},
  shopHeading: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  shopName: {fontSize: 17, lineHeight: 24},
  verified: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.brandGreenLight, borderRadius: radius.pill},
  verifiedText: {fontSize: 12, color: colors.primary},
  caption: {fontSize: 13, lineHeight: 18, color: colors.textSecondary},
  details: {gap: 8, paddingTop: 4},
  pagination: {flexDirection: 'row', gap: 8},
  modalBackdrop: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)'},
  modalCard: {width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 12, borderRadius: 20, backgroundColor: colors.white},
  modalTitle: {fontSize: 20, lineHeight: 28},
});
