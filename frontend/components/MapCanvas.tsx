'use client';
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Props = {
  wardId?: string;
  featureCollection: any;
  layers?: Record<string, boolean>;
  matches: any[];
  colorForMatch: (m: any) => string;
};

export function MapCanvas({ featureCollection, matches, colorForMatch }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json',
      center: [83.30, 17.72], zoom: 12,
    });
    map.on('load', () => {
      map.addSource('features', { type: 'geojson', data: featureCollection });
      map.addLayer({ id: 'poly', type: 'fill', source: 'features',
        paint: { 'fill-color': '#3388ff', 'fill-opacity': 0.25, 'fill-outline-color': '#1a1a1a' } });
      map.addSource('matches', { type: 'geojson',
        data: { type: 'FeatureCollection', features: matches.map((m: any) => ({
          type: 'Feature', geometry: m.feature_a_geom,
          properties: { color: colorForMatch(m), score: m.match_score } })) } });
      map.addLayer({ id: 'match-fill', type: 'fill', source: 'matches',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 } });
    });
    return () => map.remove();
  }, [featureCollection, matches]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
