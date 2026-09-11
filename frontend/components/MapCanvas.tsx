'use client';
import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

type Props = {
  wardId?: string;
  featureCollection: any;
  layers?: Record<string, boolean>;
  matches?: any[];
  colorForMatch?: (m: any) => string;
};

const loader = new Loader({
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  version: 'weekly',
});

// `colorForMatch` / `matches` are optional so Server Components can render <MapCanvas> without
// passing a function prop across the server/client boundary.
export function MapCanvas({ featureCollection, matches = [], colorForMatch = () => '#3388ff' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: google.maps.Map | undefined;
    let matchLayer: google.maps.Data | undefined;

    loader
      .importLibrary('maps')
      .then(({ Map }) => {
        if (cancelled || !ref.current) return;
        map = new Map(ref.current, {
          center: { lat: 17.72, lng: 83.3 },
          zoom: 13,
          mapTypeId: 'hybrid', // satellite + labels — good for cadastral / drone-imagery work
          streetViewControl: false,
          fullscreenControl: false,
        });

        // Source features (parcels / building footprints) — blue.
        if (featureCollection?.features?.length) {
          map.data.addGeoJson(featureCollection);
        }
        map.data.setStyle({
          fillColor: '#3388ff',
          fillOpacity: 0.18,
          strokeColor: '#e6e9ee',
          strokeWeight: 1,
        });

        // Matched geometries — separate layer, coloured by confidence/score.
        matchLayer = new google.maps.Data({ map });
        (matches ?? [])
          .filter((m: any) => m.feature_a_geom)
          .forEach((m: any) => {
            matchLayer!.addGeoJson({
              type: 'Feature',
              geometry: m.feature_a_geom,
              properties: { color: colorForMatch(m), score: m.match_score },
            });
          });
        matchLayer.setStyle((f) => ({
          fillColor: (f.getProperty('color') as string) || '#3388ff',
          fillOpacity: 0.55,
          strokeColor: '#111',
          strokeWeight: 1,
        }));

        // Fit to whatever we drew.
        const bounds = new google.maps.LatLngBounds();
        let has = false;
        const extend = (layer: google.maps.Data) =>
          layer.forEach((f) => f.getGeometry()?.forEachLatLng((ll) => { bounds.extend(ll); has = true; }));
        extend(map.data);
        extend(matchLayer);
        if (has) map.fitBounds(bounds, 40);
      })
      .catch((e) => {
        if (ref.current) {
          ref.current.innerHTML =
            `<div style="padding:16px;color:#9aa4b2;font:13px system-ui">` +
            `Map unavailable: ${e?.message ?? e}.<br/>Set <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in ` +
            `<code>frontend/.env.local</code>.</div>`;
        }
      });

    return () => {
      cancelled = true;
      if (map) google.maps.event.clearInstanceListeners(map);
      if (matchLayer) matchLayer.setMap(null);
    };
  }, [featureCollection, matches]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0, background: '#0f1216' }} />;
}
