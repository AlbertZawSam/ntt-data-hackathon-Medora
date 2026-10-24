/**
 * The address of the Amazon Location map style (Maps v2, the Standard style) for MapLibre, with the map API key.
 * Pure, used by the map-config Lambda and tested here. The key can only fetch map tiles.
 */
export function mapStyleUrl(apiKey: string, region: string, colorScheme: 'Light' | 'Dark' = 'Light'): string {
  return `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${encodeURIComponent(apiKey)}&color-scheme=${colorScheme}&variant=Default`;
}
