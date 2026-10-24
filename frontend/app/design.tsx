/**
 * Design gallery: every shared component in every state, with no sign-in, for looking at the design and checking it in
 * a browser. Reachable only in a preview run (EXPO_PUBLIC_DESIGN_PREVIEW=1); a normal build redirects away from it.
 * Sample text is placeholder, not product copy.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Chip } from '../src/ui/Badge';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { EmptyState } from '../src/ui/EmptyState';
import { Field } from '../src/ui/Field';
import { Icon } from '../src/ui/Icon';
import { Notice } from '../src/ui/Notice';
import { Page } from '../src/ui/Page';
import { Reveal } from '../src/ui/Reveal';
import { Segmented } from '../src/ui/Segmented';
import { SectionHeader } from '../src/ui/SectionHeader';
import { Skeleton, SkeletonCard } from '../src/ui/Skeleton';
import { Stat } from '../src/ui/Stat';
import { Timeline } from '../src/ui/Timeline';
import { fonts, fontSizes, spacing, useBreakpoint, useTheme } from '../src/ui/theme';

type Mode = 'car' | 'taxi' | 'ambulance';

export default function DesignGallery(): React.JSX.Element {
  const theme = useTheme();
  const breakpoint = useBreakpoint();
  const [mode, setMode] = React.useState<Mode>('car');
  const [chip, setChip] = React.useState(true);
  const [text, setText] = React.useState('');
  const wide = breakpoint !== 'compact';
  return (
    <Page title="Design gallery" subtitle={`Layout: ${breakpoint}. Every component, every state.`} actions={<Badge tone="info" icon="color-palette" label="preview" />}>
      <SectionHeader title="Buttons" subtitle="Primary, secondary, ghost, danger, link; sizes; busy and disabled" />
      <Card>
        <Button label="Find care now" icon="search" size="lg" onPress={() => undefined} />
        <Button label="Send request" icon="send" onPress={() => undefined} />
        <Button variant="secondary" label="Use my location" icon="locate" onPress={() => undefined} />
        <Button variant="ghost" label="Pick on the map" icon="map" onPress={() => undefined} />
        <Button variant="danger" label="Call 1669" icon="call" size="lg" onPress={() => undefined} />
        <Button variant="link" label="Forgot password?" onPress={() => undefined} />
        <View style={styles.row}>
          <Button size="sm" fullWidth={false} label="Small" onPress={() => undefined} />
          <Button fullWidth={false} busy label="Busy" onPress={() => undefined} />
          <Button fullWidth={false} disabled label="Disabled" onPress={() => undefined} />
        </View>
      </Card>

      <SectionHeader title="Badges and chips" subtitle="Status is always a word plus a colour" />
      <Card>
        <View style={styles.row}>
          <Badge tone="success" icon="checkmark-circle" label="Available" />
          <Badge tone="warning" icon="time" label="Limited" />
          <Badge tone="danger" icon="close-circle" label="Not available" />
          <Badge tone="info" dot label="Updated 4 min ago" />
          <Badge tone="neutral" label="May be outdated" />
        </View>
        <View style={styles.row}>
          <Chip label="Cardiology" icon="heart" selected={chip} onPress={() => setChip(!chip)} />
          <Chip label="Neurology" icon="pulse" selected={!chip} onPress={() => setChip(!chip)} />
          <Chip label="Thai" icon="language" selected={false} onPress={() => undefined} />
        </View>
      </Card>

      <SectionHeader title="Notices" />
      <View style={styles.stack}>
        <Notice tone="info" title="Using Siam">Search for a place or use your location to find hospitals near you.</Notice>
        <Notice tone="success" title="Request sent">Follow it in My requests.</Notice>
        <Notice tone="warning" title="May be outdated" actionLabel="Refresh" onAction={() => undefined}>This hospital has not confirmed its status for over an hour.</Notice>
        <Notice tone="danger" title="Could not check hospitals">If it is urgent, call 1669.</Notice>
      </View>

      <SectionHeader title="Cards" subtitle="Resting, tinted, pressable and selected" />
      <View style={[styles.grid, wide && styles.gridWide]}>
        <Reveal index={0} style={wide ? styles.half : undefined}>
          <Card onPress={() => undefined} accessibilityLabel="Best match">
            <View style={styles.row}>
              <Badge tone="primary" icon="star" label="Best match" />
              <Badge tone="success" icon="checkmark-circle" label="Available" />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Rama Nine General Hospital</Text>
            <Text style={[styles.muted, { color: theme.textMuted }]}>About 12 min by car · 4.1 km</Text>
          </Card>
        </Reveal>
        <Reveal index={1} style={wide ? styles.half : undefined}>
          <Card selected onPress={() => undefined} accessibilityLabel="Selected hospital">
            <Text style={[styles.cardTitle, { color: theme.text }]}>Selected card</Text>
            <Text style={[styles.muted, { color: theme.textMuted }]}>Has a coloured edge when chosen.</Text>
          </Card>
        </Reveal>
        <Reveal index={2} style={wide ? styles.half : undefined}>
          <Card tone="warning">
            <View style={styles.row}>
              <Icon name="warning" color={theme.warning} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tinted card</Text>
            </View>
            <Text style={[styles.muted, { color: theme.textMuted }]}>Warning tone.</Text>
          </Card>
        </Reveal>
        <Reveal index={3} style={wide ? styles.half : undefined}>
          <Card tone="danger">
            <View style={styles.row}>
              <Icon name="alert-circle" color={theme.emergency} />
              <Text style={[styles.cardTitle, { color: theme.text }]}>Emergency tone</Text>
            </View>
          </Card>
        </Reveal>
      </View>

      <SectionHeader title="Stats" />
      <View style={[styles.grid, wide && styles.gridWide]}>
        <View style={wide ? styles.third : undefined}><Stat icon="bed" label="Ready beds" value="12" tone="success" hint="Updated 4 min ago" /></View>
        <View style={wide ? styles.third : undefined}><Stat icon="mail-unread" label="Requests waiting" value="3" tone="warning" /></View>
        <View style={wide ? styles.third : undefined}><Stat icon="pulse" label="Median reply" value="48 s" tone="info" /></View>
      </View>

      <SectionHeader title="Segmented control and form fields" />
      <Card>
        <Segmented<Mode>
          accessibilityLabel="How will you arrive"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'car', label: 'Car', icon: 'car' },
            { value: 'taxi', label: 'Taxi', icon: 'car-sport' },
            { value: 'ambulance', label: 'Ambulance', icon: 'medkit' },
          ]}
        />
        <Field label="Describe what is happening" hint="Up to 1000 characters" value={text} onChangeText={setText} />
      </Card>

      <SectionHeader title="Timeline" subtitle="The agent's steps, and where a request stands" />
      <Card>
        <Timeline
          steps={[
            { id: '1', title: 'Case assessed', detail: 'Found 4 hospitals that can help.', state: 'done', time: '2 s' },
            { id: '2', title: 'Capability sources checked', detail: 'Rama Nine General Hospital (rama9/neuro.md)', state: 'done', time: '3 s' },
            { id: '3', title: 'Hospitals asked', detail: 'Waiting up to 45 seconds for replies.', state: 'active' },
            { id: '4', title: 'Recommendation', state: 'pending' },
          ]}
        />
      </Card>

      <SectionHeader title="Loading and empty states" />
      <View style={styles.stack}>
        <SkeletonCard lines={2} />
        <Card>
          <View style={styles.row}>
            <Skeleton width={44} height={44} radius={22} />
            <View style={styles.grow}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="85%" />
            </View>
          </View>
        </Card>
        <Card>
          <EmptyState icon="chatbubbles-outline" title="No requests yet" text="When you send a request to a hospital, you can follow it here." actionLabel="Find care now" onAction={() => undefined} />
        </Card>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  stack: { gap: spacing.sm + 2 },
  grid: { gap: spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  half: { width: '48.5%' },
  third: { width: '31.5%' },
  grow: { flex: 1, gap: spacing.sm },
  cardTitle: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  muted: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
