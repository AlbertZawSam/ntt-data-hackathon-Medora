/**
 * Medora home: Call 1669 always one tap away, where you are (live location, the map, place search), and the ways to get care.
 * Requirements: 3.1 to 3.6
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PLACES, distanceKm, searchPlaces } from '@medora/shared/logic/places';
import { PLACE_QUERY_MIN, type FoundPlace } from '@medora/shared/logic/placeSearch';
import { MapView } from '../../src/components/MapView';
import { call1669 } from '../../src/services/emergency';
import { searchPlacesRemote } from '../../src/services/data';
import { chooseFoundPlace, choosePlace, choosePoint, locateMe, useChosenLocation, type GpsOutcome } from '../../src/services/location';
import { pick } from '../../src/i18n/t';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { fonts, fontSizes, radii, shadow, spacing, useBreakpoint, useIsDark, useTheme } from '../../src/ui/theme';
import { focusRing, pointer, webTransition } from '../../src/ui/web';

/** One way into the app: a tinted icon, a title, and a line saying what it does. */
function ActionCard({ icon, title, hint, onPress, primary = false }: { icon: IconName; title: string; hint: string; onPress: () => void; primary?: boolean }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title} tone={primary ? 'primary' : 'neutral'} padding="lg">
      <View style={styles.actionRow}>
        <View style={[styles.actionIcon, { backgroundColor: primary ? theme.primary : theme.primarySoft }]}>
          <Icon name={icon} size={26} color={primary ? theme.onPrimary : theme.primary} />
        </View>
        <View style={styles.actionText}>
          <Text style={[styles.actionTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.actionHint, { color: theme.textMuted }]}>{hint}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
    </Card>
  );
}

/** A place in a results list. */
function PlaceRow({ name, detail, onPress }: { name: string; detail?: string; onPress: () => void }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${name}. ${detail}` : name}
      style={(state) => [
        styles.placeRow,
        { backgroundColor: (state as { hovered?: boolean }).hovered === true ? theme.primarySoft : 'transparent' },
        pointer,
        webTransition(),
        focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
      ]}
    >
      <Icon name="location-outline" size={20} color={theme.primary} />
      <View style={styles.placeText}>
        <Text numberOfLines={1} style={[styles.placeName, { color: theme.text }]}>{name}</Text>
        {detail ? <Text numberOfLines={1} style={[styles.placeDetail, { color: theme.textMuted }]}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function PatientHomeScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const dark = useIsDark();
  const router = useRouter();
  const { lang } = useApp();
  const wide = useBreakpoint() === 'expanded';
  const location = useChosenLocation();
  const [query, setQuery] = React.useState('');
  const [locating, setLocating] = React.useState(false);
  const [notice, setNotice] = React.useState<GpsOutcome | 'outsidePick' | null>(null);
  const [picking, setPicking] = React.useState(false);
  const matches = React.useMemo(() => searchPlaces(query), [query]);
  const [found, setFound] = React.useState<FoundPlace[]>([]);

  // More places from Amazon Location after a short pause in typing. Only the typed text is sent (requirement 3.6).
  React.useEffect(() => {
    const text = query.trim();
    if (text.length < PLACE_QUERY_MIN) {
      setFound([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchPlacesRemote(text, lang).then((places) => {
        if (!cancelled) setFound(places);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, lang]);
  // A found place right beside a built-in suggestion is the same place; show it once.
  const extra = found.filter((place) => !matches.some((known) => distanceKm(known, place) < 0.3));

  const onUseMyLocation = async (): Promise<void> => {
    setLocating(true);
    const outcome = await locateMe();
    // A reading dropped because the person chose another place meanwhile is not an error to show.
    setNotice(outcome === 'superseded' ? null : outcome);
    setLocating(false);
    if (outcome !== 'superseded') {
      setQuery('');
      setPicking(false);
    }
  };

  const noticeText =
    notice === 'outsidePick'
      ? t('patient.home.pickOutside')
      : notice === 'outsideBangkok'
        ? t('patient.home.outsideBangkok')
        : notice === 'insecure'
          ? t('patient.home.locationInsecure')
          : notice === 'timeout'
            ? t('patient.home.locationTimeout')
            : notice === 'denied' || notice === 'unavailable'
              ? t('patient.home.locationUnavailable')
              : null;

  const where =
    location.source === 'gps'
      ? location.accuracyM !== undefined
        ? t('patient.home.locationGpsLive', { m: Math.max(1, Math.round(location.accuracyM)) })
        : t('patient.home.locationGps')
      : location.source === 'map'
        ? t('patient.home.locationMap')
        : t('patient.home.locationPlace', { place: location.place ? pick(location.place.name, lang) : '' });

  const searching = query.trim().length > 0;

  const emergency = (
    <Reveal index={0}>
      <Card tone="danger" onPress={() => void call1669()} accessibilityLabel={t('patient.home.call1669')} padding="lg">
        <View style={styles.actionRow}>
          <View style={[styles.sos, { backgroundColor: theme.emergency }]}>
            <Icon name="call" size={30} color={theme.onEmergency} />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.sosTitle, { color: theme.emergency }]}>{t('patient.home.call1669')}</Text>
            <Text style={[styles.actionHint, { color: theme.text }]}>{t('patient.home.emergencyHint')}</Text>
          </View>
          <Icon name="chevron-forward" size={22} color={theme.emergency} />
        </View>
      </Card>
    </Reveal>
  );

  const actions = (
    <View style={styles.stack}>
      <Reveal index={1}>
        <ActionCard primary icon="search" title={t('patient.home.findCare')} hint={t('patient.home.findCareHint')} onPress={() => router.push('/(patient)/care' as Href)} />
      </Reveal>
      <Reveal index={2}>
        <ActionCard icon="people" title={t('patient.home.findSpecialist')} hint={t('patient.home.findSpecialistHint')} onPress={() => router.push('/(patient)/specialists' as Href)} />
      </Reveal>
      <Reveal index={3}>
        <ActionCard icon="chatbubbles" title={t('patient.home.myRequests')} hint={t('patient.home.myRequestsHint')} onPress={() => router.push('/(patient)/requests' as Href)} />
      </Reveal>
    </View>
  );

  const locationCard = (
    <Reveal index={wide ? 1 : 4}>
      <Card padding="lg">
        <View style={styles.locationHead}>
          <View style={styles.locationTitle}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>{t('patient.home.whereTitle')}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.where, { color: theme.textMuted }]}>{where}</Text>
          </View>
          {location.source === 'gps' ? <Badge tone="success" dot label={t('patient.home.followingBadge')} /> : location.source === 'default' ? null : <Badge tone="info" icon="pin" label={t('patient.home.placeBadge')} />}
        </View>

        <View style={styles.mapFrame}>
          <MapView
            accessibilityLabel={t('map.alt.pick')}
            height={wide ? 280 : 220}
            markers={[
              ...(picking ? PLACES.map((p) => ({ id: p.key, point: p, kind: 'place' as const })) : []),
              { id: 'me', point: location, kind: 'me' as const, label: t('map.you') },
            ]}
            onPick={picking ? (point) => setNotice(choosePoint(point) ? null : 'outsidePick') : undefined}
          />
          <View style={styles.searchOverlay} pointerEvents="box-none">
            <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }, shadow(2, dark)]}>
              <Icon name="search" size={20} color={theme.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('patient.home.searchPlaceholder')}
                placeholderTextColor={theme.textMuted}
                accessibilityLabel={t('patient.home.searchLabel')}
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.searchInput, { color: theme.text }]}
              />
              {query ? <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => setQuery('')} hitSlop={8}><Icon name="close-circle" size={20} color={theme.textMuted} /></Pressable> : null}
            </View>
        {searching ? (
          <View accessibilityLiveRegion="polite" style={[styles.results, styles.dropdown, shadow(2, dark), { maxHeight: (wide ? 280 : 220) - 72 }, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            {matches.map((place) => (
              <PlaceRow
                key={place.key}
                name={pick(place.name, lang)}
                onPress={() => {
                  choosePlace(place);
                  setNotice(null);
                  setQuery('');
                  setPicking(false);
                }}
              />
            ))}
            {extra.length > 0 ? <Text style={[styles.groupLabel, { color: theme.textMuted }]}>{t('patient.home.morePlaces')}</Text> : null}
            {extra.map((place) => (
              <PlaceRow
                key={place.id}
                name={place.name}
                detail={place.detail}
                onPress={() => {
                  if (chooseFoundPlace(place)) {
                    setNotice(null);
                    setQuery('');
                    setPicking(false);
                  } else {
                    setNotice('outsidePick');
                  }
                }}
              />
            ))}
            {matches.length === 0 && extra.length === 0 ? <Text style={[styles.empty, { color: theme.textMuted }]}>{t('patient.home.noPlaces')}</Text> : null}
          </View>
        ) : null}
          </View>
        </View>
        {picking ? <Notice tone="info">{t('patient.home.pickHint')}</Notice> : null}
        {noticeText ? <Notice tone="warning">{noticeText}</Notice> : null}

        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button icon="locate" label={t('patient.home.useMyLocation')} busy={locating} onPress={() => void onUseMyLocation()} />
          </View>
          <View style={styles.flex}>
            <Button variant="secondary" icon={picking ? 'checkmark' : 'hand-left-outline'} label={picking ? t('patient.home.stopPicking') : t('patient.home.pickOnMap')} onPress={() => setPicking(!picking)} />
          </View>
        </View>

      </Card>
    </Reveal>
  );

  return (
    <Page title={t('patient.home.headline')} subtitle={t('patient.home.sub')}>
      {wide ? (
        <View style={styles.columns}>
          <View style={[styles.column, styles.stack]}>
            {emergency}
            {actions}
          </View>
          <View style={styles.column}>{locationCard}</View>
        </View>
      ) : (
        <View style={styles.stack}>
          {emergency}
          {locationCard}
          {actions}
        </View>
      )}
      <Notice tone="neutral">{t('patient.care.disclaimer')}</Notice>
    </Page>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: { width: 52, height: 52, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  sos: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, gap: 2 },
  actionTitle: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  sosTitle: { fontSize: fontSizes.xl + 2, fontFamily: fonts.bold },
  actionHint: { fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: 20 },
  locationHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  locationTitle: { flex: 1, gap: 2 },
  cardTitle: { fontSize: fontSizes.xl, fontFamily: fonts.bold },
  where: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  results: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
  mapFrame: { position: 'relative' },
  searchOverlay: { position: 'absolute', top: spacing.sm, left: spacing.sm, right: 64, gap: spacing.xs, zIndex: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1 },
  searchInput: { flex: 1, minHeight: 44, fontSize: fontSizes.md, fontFamily: fonts.regular, outlineStyle: 'none' } as never,
  dropdown: { marginTop: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, minHeight: 52, paddingHorizontal: spacing.md },
  placeText: { flex: 1, gap: 1 },
  placeName: { fontSize: fontSizes.md, fontFamily: fonts.medium },
  placeDetail: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
  groupLabel: { fontSize: fontSizes.xs, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  empty: { fontSize: fontSizes.sm, fontFamily: fonts.regular, padding: spacing.md },
});
