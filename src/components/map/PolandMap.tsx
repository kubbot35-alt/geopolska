import React, {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {GeoCoordinate, RoundOutcome} from '../../domain/types';

export const POLAND_DEFAULT_CENTER: GeoCoordinate = {lat: 52.0, lng: 19.1};
export const POLAND_DEFAULT_ZOOM = 6;

interface TileLayerSpec {
  readonly url: string;
  readonly attribution: string;
  readonly maxZoom: number;
  readonly subdomains: string;
}

const TERRAIN_TILE_LAYER: TileLayerSpec = {
  url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap &copy; OpenTopoMap',
  maxZoom: 17,
  subdomains: 'abc',
};

function createTeardropPinIcon(fill: string, stroke: string, dot: string, size = 30): L.DivIcon {
  const height = Math.round(size * 1.25);
  return L.divIcon({
    className: 'geopolska-pin-icon',
    iconSize: [size, height],
    iconAnchor: [size / 2, height - 2],
    html: `<svg width="${size}" height="${height}" viewBox="0 0 28 35" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.55));display:block;">
      <path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14C1.5 23.2 14 33.5 14 33.5C14 33.5 26.5 23.2 26.5 14C26.5 7.1 20.9 1.5 14 1.5Z" fill="${fill}" stroke="${stroke}" stroke-width="2.2"/>
      <circle cx="14" cy="13.5" r="4.5" fill="${dot}"/>
    </svg>`,
  });
}

function createNumberedBadgeIcon(
  num: number,
  variant: 'actual' | 'guess',
): L.DivIcon {
  const isActual = variant === 'actual';
  const size = isActual ? 28 : 24;
  const bg = isActual ? '#059669' : '#FBBF24';
  const border = isActual ? '#A7F3D0' : '#090E14';
  const color = isActual ? '#FFFFFF' : '#090E14';

  return L.divIcon({
    className: 'geopolska-badge-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:2px solid ${border};color:${color};display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:${isActual ? 12 : 11}px;font-weight:700;box-shadow:0 3px 10px rgba(0,0,0,0.5);">${num}</div>`,
  });
}

export type PolandMapMode =
  | {
      readonly kind: 'guess';
      readonly roundKey: string;
      readonly selectedGuess: GeoCoordinate | null;
      readonly onSelectGuess: (coord: GeoCoordinate) => void;
    }
  | {
      readonly kind: 'result';
      readonly outcome: RoundOutcome;
    }
  | {
      readonly kind: 'summary';
      readonly rounds: readonly RoundOutcome[];
    };

export interface PolandMapProps {
  readonly mode: PolandMapMode;
  readonly className?: string;
}

/**
 * Interactive 100% free Leaflet terrain map of Poland (OpenTopoMap).
 * Zero paid API keys or billing required. Automatically invalidates size on dock expand/collapse.
 */
export const PolandMap: React.FC<PolandMapProps> = ({
  mode,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayGroupRef = useRef<L.LayerGroup | null>(null);
  const lastRoundKeyRef = useRef<string | null>(null);

  // Keep latest mode callback in ref to avoid re-initializing the Leaflet map on every click
  const modeRef = useRef<PolandMapMode>(mode);
  modeRef.current = mode;

  // 1. Initialize Leaflet map instance once with OpenTopoMap Terrain layer & watch container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const map = L.map(container, {
      center: [POLAND_DEFAULT_CENTER.lat, POLAND_DEFAULT_CENTER.lng],
      zoom: POLAND_DEFAULT_ZOOM,
      minZoom: 5,
      maxZoom: TERRAIN_TILE_LAYER.maxZoom,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({position: 'bottomright'}).addTo(map);

    L.tileLayer(TERRAIN_TILE_LAYER.url, {
      attribution: TERRAIN_TILE_LAYER.attribution,
      maxZoom: TERRAIN_TILE_LAYER.maxZoom,
      subdomains: TERRAIN_TILE_LAYER.subdomains,
    }).addTo(map);

    const overlayGroup = L.layerGroup().addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const currentMode = modeRef.current;
      if (currentMode.kind !== 'guess') {
        return;
      }
      currentMode.onSelectGuess({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    });

    mapRef.current = map;
    overlayGroupRef.current = overlayGroup;

    let rafId = 0;
    const invalidate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        map.invalidateSize({animate: false});
      });
    };

    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(container);

    // Extra settle tick after CSS transition finishes
    const initTimer = window.setTimeout(invalidate, 320);

    return () => {
      window.clearTimeout(initTimer);
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      overlayGroupRef.current = null;
      lastRoundKeyRef.current = null;
    };
  }, []);

  // 3. Render markers, polylines, and bounds for the active mode (guess / result / summary)
  useEffect(() => {
    const map = mapRef.current;
    const overlayGroup = overlayGroupRef.current;
    if (!map || !overlayGroup) {
      return;
    }

    overlayGroup.clearLayers();

    if (mode.kind === 'guess') {
      if (lastRoundKeyRef.current !== mode.roundKey) {
        lastRoundKeyRef.current = mode.roundKey;
        map.setView([POLAND_DEFAULT_CENTER.lat, POLAND_DEFAULT_CENTER.lng], POLAND_DEFAULT_ZOOM, {
          animate: false,
        });
      }

      if (mode.selectedGuess) {
        const marker = L.marker([mode.selectedGuess.lat, mode.selectedGuess.lng], {
          draggable: true,
          title: 'Twój wybór — przeciągnij aby doprecyzować',
          icon: createTeardropPinIcon('#10B981', '#064E3B', '#ECFDF5', 32),
        });

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const latest = modeRef.current;
          if (latest.kind === 'guess') {
            latest.onSelectGuess({lat: pos.lat, lng: pos.lng});
          }
        });

        marker.addTo(overlayGroup);
      }
      return;
    }

    if (mode.kind === 'result') {
      const {outcome} = mode;
      const actualLatLng: L.LatLngTuple = [outcome.location.lat, outcome.location.lng];

      L.marker(actualLatLng, {
        title: outcome.location.name,
        icon: createTeardropPinIcon('#10B981', '#065F46', '#ECFDF5', 34),
      })
        .bindTooltip(outcome.location.name, {direction: 'top', offset: [0, -34]})
        .addTo(overlayGroup);

      if (outcome.guess) {
        const guessLatLng: L.LatLngTuple = [outcome.guess.lat, outcome.guess.lng];
        L.marker(guessLatLng, {
          title: 'Twój strzał',
          icon: createTeardropPinIcon('#F59E0B', '#78350F', '#090E14', 28),
        }).addTo(overlayGroup);

        L.polyline([guessLatLng, actualLatLng], {
          color: '#34D399',
          weight: 3,
          opacity: 0.92,
          dashArray: '8 8',
        }).addTo(overlayGroup);

        const bounds = L.latLngBounds([guessLatLng, actualLatLng]);
        map.fitBounds(bounds, {padding: [48, 48], maxZoom: 12, animate: false});
      } else {
        map.setView(actualLatLng, 8, {animate: false});
      }
      return;
    }

    if (mode.kind === 'summary') {
      const points: L.LatLngTuple[] = [];
      for (const round of mode.rounds) {
        const actualLatLng: L.LatLngTuple = [round.location.lat, round.location.lng];
        points.push(actualLatLng);

        L.marker(actualLatLng, {
          title: `Runda ${round.roundNumber} — ${round.location.name}`,
          icon: createNumberedBadgeIcon(round.roundNumber, 'actual'),
        })
          .bindTooltip(`#${round.roundNumber} ${round.location.name}`, {
            direction: 'top',
            offset: [0, -14],
          })
          .addTo(overlayGroup);

        if (round.guess) {
          const guessLatLng: L.LatLngTuple = [round.guess.lat, round.guess.lng];
          points.push(guessLatLng);

          L.marker(guessLatLng, {
            title: `Runda ${round.roundNumber} — Twój wybór`,
            icon: createNumberedBadgeIcon(round.roundNumber, 'guess'),
          }).addTo(overlayGroup);

          L.polyline([guessLatLng, actualLatLng], {
            color: '#34D399',
            weight: 2.5,
            opacity: 0.85,
            dashArray: '6 7',
          }).addTo(overlayGroup);
        }
      }

      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points), {padding: [42, 42], maxZoom: 11, animate: false});
      } else {
        map.setView([POLAND_DEFAULT_CENTER.lat, POLAND_DEFAULT_CENTER.lng], POLAND_DEFAULT_ZOOM, {
          animate: false,
        });
      }
    }
  }, [mode]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#0F1722] ${className}`}>
      {/* Leaflet Canvas Mount (OpenTopoMap Terrain) */}
      <div
        ref={containerRef}
        className={`h-full w-full ${mode.kind === 'guess' ? 'cursor-crosshair' : ''}`}
      />
    </div>
  );
};
