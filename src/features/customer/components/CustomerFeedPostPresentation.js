import {RatingSummary} from '../../marketplace/components/ServiceReviews';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {CustomerAction, CustomerCard, CustomerPressable, CustomerText} from './CustomerUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import ShowcasePhoto from '../../marketplace/components/ShowcasePhoto';

// Discover-only presentation. PostCard owns the existing save mutation and media
// access stays in ShowcasePhoto; the detail screen retains its full gallery.
export default function CustomerFeedPostPresentation({
  post, onOpen, photos, author, place, time, vehicle,
  saved, busy, offline, error, message, onToggleSaved, onProfile,
}) {
  const {theme} = useTheme();
  const Identity=onProfile?CustomerPressable:View;
  const shopAuthor = post.authorRole === 'shop';
  const verified = shopAuthor && (
    post.verificationStatus === 'approved' || post.shop?.verificationStatus === 'approved'
  );

  return (
    <CustomerCard style={styles.post}>
      <Identity accessibilityRole={onProfile?'button':undefined} accessibilityLabel={onProfile?`View workshop: ${author}`:undefined} onPress={onProfile} style={styles.identity}>
        <ProfileAvatar
          context={shopAuthor && post.shop?.id ? 'shop' : 'post'}
          id={shopAuthor && post.shop?.id ? post.shop.id : post.id}
          revision={post.authorPhotoRevision ?? post.shop?.profilePhotoRevision}
          shop={shopAuthor}
          size={40}
        />
        <View style={styles.identityCopy}>
          <CustomerText style={styles.author}>{author}</CustomerText>
          {!!(place || time) && <CustomerText muted style={styles.meta}>{[place, time].filter(Boolean).join(' · ')}</CustomerText>}
          {!!post.shop?.ratingSummary&&<RatingSummary summary={post.shop.ratingSummary}/>}
          {verified && <CustomerText style={[styles.meta, {color: theme.textPrimary}]}>Verified workshop</CustomerText>}
        </View>
      </Identity>

      <CustomerPressable
        accessibilityRole="button"
        accessibilityLabel={`View ${post.title}`}
        onPress={onOpen}
        style={styles.content}
      >
        <CustomerText muted style={styles.category}>
          {[post.type === 'showcase' ? 'SHOWCASE' : 'BUILD', post.serviceCategory || post.category].filter(Boolean).join(' / ')}
        </CustomerText>
        <CustomerText heading>{post.title}</CustomerText>
        {!!post.description && <CustomerText muted>{post.description}</CustomerText>}
        {!!vehicle && <CustomerText style={styles.vehicle}>{vehicle}</CustomerText>}
      </CustomerPressable>

      <View style={[styles.media, {backgroundColor: theme.surfaceMuted}]}>
        {photos.length ? (
          <ShowcasePhoto postId={post.id} image={photos[0]} style={styles.image}/>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="images-outline" size={28} color={theme.textSecondary}/>
            <CustomerText muted>No project photo available</CustomerText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <CustomerAction title="View showcase" onPress={onOpen}/>
        <CustomerAction
          title={saved ? 'Unsave post' : 'Save post'}
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          iconOnly
          accessibilityState={{selected: saved}}
          disabled={busy || offline}
          loading={busy}
          onPress={event => { event?.stopPropagation?.(); void onToggleSaved(); }}
        />
      </View>
      {!!error && <CustomerText accessibilityRole="alert" style={{color: theme.error}}>{error}</CustomerText>}
      {!!message && <CustomerText accessibilityLiveRegion="polite" muted>{message}</CustomerText>}
    </CustomerCard>
  );
}

const styles = StyleSheet.create({
  post: {padding: 16, gap: 14},
  identity: {flexDirection: 'row', alignItems: 'center', gap: 10},
  identityCopy: {flex: 1, minWidth: 0, gap: 2},
  author: {fontWeight: '600'},
  meta: {fontSize: 12, lineHeight: 18},
  content: {gap: 8, borderRadius: 8},
  category: {fontSize: 11, lineHeight: 18},
  vehicle: {fontSize: 13, lineHeight: 20},
  media: {borderRadius: 12, overflow: 'hidden'},
  image: {width: '100%', aspectRatio: 4 / 3},
  placeholder: {aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', gap: 8},
  footer: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
});
