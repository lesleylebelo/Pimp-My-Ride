import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import colors from '../../../shared/theme/colors';
import {radius} from '../../../shared/theme/typography';
import {ownerRoutes} from '../../marketplace/components/MarketplaceUI';
import {useMarketData} from '../../marketplace/hooks/useMarketData';
import {LandingButton, LandingShell, LandingText, ownerTabs, ui, useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import {FeedSearchInput, FeedServicePill} from '../../../shared/components/landing/FeedControls';

const matches = (shop, query) => Object.values(shop).some(value => String(value || '').toLowerCase().includes(query));

export default function OwnerHomeScreen({navigation}) {
  const feedback = useLandingFeedback();
  const [cursor, setCursor] = useState(null);
  const [feedShops, setFeedShops] = useState([]);
  const requestedCursors = useRef(new Set());
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState(null);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [detailShop, setDetailShop] = useState(null);
  const [savedShops, setSavedShops] = useState({});
  const shops = useMarketData('shops', {cursor});
  const categories = useMarketData('categories');
  useEffect(() => {
    if (!shops.data) return;
    setFeedShops(previous => {
      const known = new Set(previous.map(shop => shop.id));
      return [...previous, ...shops.data.items.filter(shop => !known.has(shop.id))];
    });
  }, [shops.data]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleShops = useMemo(() => feedShops.filter(shop => {
    const services = String(shop.services || '').toLowerCase();
    return (!normalizedQuery || matches(shop, normalizedQuery)) &&
      (!category || services.includes(category.toLowerCase())) &&
      (!location || ((!location.city || shop.city === location.city) && (!location.province || shop.province === location.province)));
  }), [feedShops, normalizedQuery, category, location]);
  const locations = useMemo(() => {
    const seen = new Set();
    return feedShops.reduce((values, shop) => {
      if (!shop.city && !shop.province) return values;
      const key = `${shop.city || ''}|${shop.province || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        values.push({city: shop.city || '', province: shop.province || ''});
      }
      return values;
    }, []);
  }, [feedShops]);
  const provinces = useMemo(() => [...new Set(feedShops.map(shop => shop.province).filter(Boolean))], [feedShops]);
  const cities = useMemo(() => [...new Set(feedShops.map(shop => shop.city).filter(Boolean))], [feedShops]);
  const disabled = shops.busy || categories.busy;
  const soon = feedback.showFeature;
  const requestNextPage = () => {
    const nextCursor = shops.data?.cursor;
    if (nextCursor && !shops.busy && !requestedCursors.current.has(nextCursor)) {
      requestedCursors.current.add(nextCursor);
      setCursor(nextCursor);
    }
  };
  const loadNextPage = event => {
    const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height < 260) requestNextPage();
  };
  const handleLayout = event => {
    viewportHeight.current = event.nativeEvent.layout.height;
    if (contentHeight.current - viewportHeight.current < 260) requestNextPage();
  };
  const handleContentSizeChange = (_, height) => {
    contentHeight.current = height;
    if (height - viewportHeight.current < 260) requestNextPage();
  };
  const saveShop = id => setSavedShops(previous => ({...previous, [id]: !previous[id]}));
  const retryFeed = () => {void shops.refresh().catch(() => {});};

  return <LandingShell title="Discover" tabs={ownerTabs} activeTab="Discover" {...feedback} onScroll={loadNextPage} onLayout={handleLayout} onContentSizeChange={handleContentSizeChange} onTabPress={label => ownerRoutes[label] ? navigation.navigate(ownerRoutes[label]) : soon(label)}>
    <FeedSearchInput accessibilityLabel="Search workshops or services" placeholder="Search workshops or services" value={query} onChangeText={setQuery} editable={!shops.busy}/>
    <LandingText style={styles.intro}>Explore workshops and their services</LandingText>
    <LandingText weight="medium">Browse by service</LandingText>
    <View style={styles.categories}>
      <FeedServicePill title="All" selected={!category} disabled={categories.busy} onPress={() => setCategory('')}/>
      {(categories.data?.items || []).map(item => <FeedServicePill key={item.id} title={item.name} selected={category === item.name} disabled={categories.busy} onPress={() => setCategory(item.name)}/>)}
      <FeedServicePill title="More filters" selected={false} disabled={disabled} onPress={() => setMoreFiltersOpen(true)}/>
    </View>
    {(shops.busy && !feedShops.length || categories.busy) && <LandingText accessibilityRole="status" style={ui.muted}>Loading approved workshops...</LandingText>}
    {!!(shops.error || categories.error) && <LandingText accessibilityRole="alert" style={ui.error}>{shops.error || categories.error}</LandingText>}
    {!!shops.error && <LandingButton title="Retry loading workshops" outline onPress={retryFeed}/>}
    {!shops.busy && !shops.error && !visibleShops.length && <LandingText style={ui.muted}>{feedShops.length ? 'No workshops match these filters.' : 'No approved workshops are available yet.'}</LandingText>}
    {visibleShops.map(shop => <View key={shop.id} style={[ui.card, styles.postCard]}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}><LandingText weight="medium" style={styles.avatarText}>{initials(shop.shopName)}</LandingText></View>
        <View style={styles.authorCopy}>
          <LandingText weight="medium" style={styles.authorName}>{shop.shopName}</LandingText>
          <LandingText style={styles.caption}>{[shop.city, shop.province].filter(Boolean).join(' · ') || 'Location not provided'}</LandingText>
        </View>
      </View>
      {shop.verified && <View style={styles.verified}><Ionicons name="checkmark-circle-outline" size={16} color={colors.primary}/><LandingText style={styles.verifiedText}>Verified workshop</LandingText></View>}
      <LandingText weight="medium" style={styles.postTitle}>{shop.services?.split(',')[0]?.trim() || 'Workshop services'}</LandingText>
      <LandingText style={styles.postCopy}>{shop.services || 'Explore this workshop and its services.'}</LandingText>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${shop.shopName}`} onPress={() => setDetailShop(shop)} style={styles.viewButton}>
          <LandingText weight="medium" style={styles.viewLabel}>View</LandingText>
          <Ionicons name="arrow-forward" size={15} color={colors.primary} accessible={false}/>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={savedShops[shop.id] ? `Unsave ${shop.shopName}` : `Save ${shop.shopName}`} accessibilityState={{selected: !!savedShops[shop.id]}} onPress={() => saveShop(shop.id)} hitSlop={8} style={styles.saveButton}>
          <Ionicons name={savedShops[shop.id] ? 'bookmark' : 'bookmark-outline'} size={20} color={savedShops[shop.id] ? colors.primary : colors.textSecondary}/>
          <LandingText style={styles.saveLabel}>{savedShops[shop.id] ? 'Saved' : 'Save'}</LandingText>
        </Pressable>
      </View>
    </View>)}
    {shops.busy && !!feedShops.length && <LandingText accessibilityRole="status" style={styles.feedStatus}>Loading more workshops...</LandingText>}
    <Modal visible={!!detailShop} transparent animationType="fade" onRequestClose={() => setDetailShop(null)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <View style={styles.detailHeader}>
            <View style={styles.avatar}><LandingText weight="medium" style={styles.avatarText}>{initials(detailShop?.shopName)}</LandingText></View>
            <LandingText accessibilityRole="header" weight="medium" style={styles.modalTitle}>{detailShop?.shopName}</LandingText>
          </View>
          {detailShop?.verified && <View style={styles.verified}><Ionicons name="checkmark-circle-outline" size={16} color={colors.primary}/><LandingText style={styles.verifiedText}>Verified workshop</LandingText></View>}
          <LandingText style={styles.caption}>Location</LandingText>
          <LandingText>{[detailShop?.city, detailShop?.province].filter(Boolean).join(' · ') || 'Location not provided'}</LandingText>
          <LandingText style={styles.caption}>Services</LandingText>
          <LandingText>{detailShop?.services || 'Services not provided'}</LandingText>
          <LandingButton title="Close" outline onPress={() => setDetailShop(null)}/>
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
            const match = feedShops.find(shop => shop.city === city);
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

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLowerCase() || 'w';
}

const styles = StyleSheet.create({
  intro: {color: colors.textSecondary, marginTop: -8},
  postCard: {padding: 16, gap: 12},
  authorRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandGreenLight, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 14, color: colors.primary},
  authorCopy: {flex: 1, gap: 1},
  authorName: {fontSize: 14},
  postTitle: {fontSize: 17, lineHeight: 24, fontWeight: '600'},
  postCopy: {fontSize: 14, lineHeight: 21, color: colors.textSecondary},
  cardActions: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4},
  viewButton: {minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6},
  viewLabel: {color: colors.primary},
  saveButton: {minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6},
  saveLabel: {fontSize: 12, color: colors.textSecondary},
  feedStatus: {alignSelf: 'center', paddingVertical: 8, color: colors.textSecondary},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  verified: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.brandGreenLight, borderRadius: radius.pill},
  verifiedText: {fontSize: 12, color: colors.primary},
  caption: {fontSize: 13, lineHeight: 18, color: colors.textSecondary},
  detailHeader: {flexDirection: 'row', alignItems: 'center', gap: 10},
  modalBackdrop: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)'},
  modalCard: {width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 12, borderRadius: 20, backgroundColor: colors.white},
  modalTitle: {fontSize: 20, lineHeight: 28},
});
