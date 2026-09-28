'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { HAZARD_META, OFFLINE_HEX, RISK_META } from '@iris/config';
import type { Gateway, HazardClass, Incident, IrisNode, Region, RiskLevel } from '@iris/types';
import { INFRASTRUCTURE, RIVER_PATH } from '@/lib/engine/seed';
import { norm } from '@/lib/engine/fusion';
import { riskFromScore } from '@/lib/derive';
import { timeAgo } from '@/lib/utils';

export type MapLayer = 'health' | 'risk' | 'rainfall' | 'water' | 'air' | 'fire' | 'population' | 'infra';
export type RegionMode = 'FLOOD' | 'FIRE' | 'AIR' | 'LANDSLIDE' | 'COMPOSITE';

interface Props {
  nodes: IrisNode[];
  gateways: Gateway[];
  incidents: Incident[];
  now: number;
  layers: Set<MapLayer>;
  hazardFilter: HazardClass | 'ALL';
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  regions?: (Region & { nodes?: number; activeAlerts?: number })[];
  regionMode?: RegionMode | null;
  selectedRegion?: string | null;
  onRegion?: (id: string) => void;
  className?: string;
}

const LETTER: Record<string, string> = { FLOOD: 'W', FIRE: 'F', AIR: 'A', LANDSLIDE: 'L', WATER_QUALITY: 'Q', HEAT: 'H', INDUSTRIAL: 'I' };

function statusHex(n: IrisNode) {
  return n.health_status === 'OFFLINE' ? OFFLINE_HEX : RISK_META[n.risk_level].hex;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function popupHtml(n: IrisNode, now: number) {
  const pods = n.installed_pods.map((p) => p.name).join(', ');
  const status = n.health_status === 'OFFLINE' ? 'OFFLINE' : n.risk_level;
  return `<div style="min-width:210px">
    <div style="font-weight:700;font-size:13px;color:#0f2140">${esc(n.code)}</div>
    <div style="color:#64748b;margin-bottom:6px">${esc(n.location.site)} · ${esc(n.location.district)}</div>
    <table style="width:100%;font-size:11.5px;border-collapse:collapse">
      <tr><td style="color:#64748b">Hazard class</td><td style="text-align:right;font-weight:600">${esc(HAZARD_META[n.hazard].label)}</td></tr>
      <tr><td style="color:#64748b">Installed pod</td><td style="text-align:right;font-weight:600">${esc(pods)}</td></tr>
      <tr><td style="color:#64748b">Battery</td><td style="text-align:right;font-weight:600">${n.battery.toFixed(0)}%</td></tr>
      <tr><td style="color:#64748b">Signal</td><td style="text-align:right;font-weight:600">${n.signal.toFixed(0)} dBm</td></tr>
      <tr><td style="color:#64748b">Last seen</td><td style="text-align:right;font-weight:600">${esc(timeAgo(n.last_seen, now))}</td></tr>
      <tr><td style="color:#64748b">Health</td><td style="text-align:right;font-weight:600">${esc(n.health_status.replace('_', ' '))}</td></tr>
      <tr><td style="color:#64748b">Risk (severity)</td><td style="text-align:right;font-weight:700">${esc(status)}</td></tr>
      <tr><td style="color:#64748b">Confidence</td><td style="text-align:right;font-weight:600">${esc(n.confidence_level)} · ${(n.confidence * 100).toFixed(0)}%</td></tr>
    </table>
    <div style="margin-top:6px;font-size:10px;color:#7c8aa3">Click marker for details · DEMO / SIMULATED</div>
  </div>`;
}

function iconHtml(n: IrisNode, selected: boolean) {
  const color = statusHex(n);
  const pulse = n.risk_level === 'CRITICAL' && n.health_status !== 'OFFLINE' ? 'iris-marker-pulse' : '';
  const ring = selected ? '0 0 0 3px #3563a8,' : '';
  return `<div class="${pulse}" style="width:30px;height:30px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:${ring}0 1px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px system-ui,sans-serif">${LETTER[n.hazard] ?? '?'}</div>`;
}

export default function IrisMap(props: Props) {
  const { nodes, gateways, incidents, now, layers, hazardFilter, selectedId, onSelect, regions, regionMode, selectedRegion, onRegion, className } = props;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const groups = useRef<{ nodes?: Leaflet.LayerGroup; overlay?: Leaflet.LayerGroup; fixed?: Leaflet.LayerGroup; regions?: Leaflet.LayerGroup }>({});
  const markers = useRef<Map<string, { m: Leaflet.Marker; key: string }>>(new Map());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onRegionRef = useRef(onRegion);
  onRegionRef.current = onRegion;

  /* init */
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    import('leaflet').then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (cancelled || !el.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 16 }).setView([30.15, 78.25], 9);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      });
      let errs = 0;
      tiles.on('tileerror', () => {
        errs++;
        if (errs > 4) setTilesFailed(true);
      });
      tiles.addTo(map);
      groups.current = {
        regions: L.layerGroup().addTo(map),
        overlay: L.layerGroup().addTo(map),
        fixed: L.layerGroup().addTo(map),
        nodes: L.layerGroup().addTo(map),
      };
      mapRef.current = map;
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markers.current.clear();
      setReady(false);
    };
  }, []);

  /* fixed layers: river, gateways, infrastructure, population */
  useEffect(() => {
    const L = LRef.current;
    const g = groups.current.fixed;
    if (!ready || !L || !g) return;
    g.clearLayers();
    L.polyline(RIVER_PATH, { color: '#60a5fa', weight: 4, opacity: 0.55 }).bindTooltip('River corridor (schematic)').addTo(g);
    for (const gw of gateways) {
      L.marker([gw.lat, gw.lon], {
        icon: L.divIcon({
          className: '',
          iconSize: [22, 22],
          html: `<div style="width:22px;height:22px;border-radius:5px;background:${gw.uplink_ok ? '#1f3f70' : '#f97316'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:700 9px system-ui;display:flex;align-items:center;justify-content:center">GW</div>`,
        }),
      })
        .bindTooltip(`${gw.id} · ${gw.hardware} · uplink ${gw.uplink_ok ? 'OK' : 'DOWN'}`)
        .addTo(g);
    }
    if (layers.has('infra')) {
      for (const c of INFRASTRUCTURE) {
        L.marker([c.lat, c.lon], {
          icon: L.divIcon({
            className: '',
            iconSize: [16, 16],
            html: `<div style="width:16px;height:16px;transform:rotate(45deg);background:#475569;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
          }),
        })
          .bindTooltip(`${c.name} · ${c.kind.replace('_', ' ')} (demo)`)
          .addTo(g);
      }
    }
  }, [ready, gateways, layers]);

  /* population layer (uses region polygons) */
  useEffect(() => {
    const L = LRef.current;
    const g = groups.current.regions;
    if (!ready || !L || !g) return;
    g.clearLayers();
    if (!regions) return;
    const showPop = layers.has('population');
    if (!regionMode && !showPop) return;
    for (const r of regions) {
      const score = regionMode ? r.risk[regionMode] : 0;
      const lvl = riskFromScore(score);
      const color = regionMode ? RISK_META[lvl].hex : '#3563a8';
      const fill = regionMode ? 0.18 + score * 0.45 : 0.06 + Math.min(0.3, r.population / 900_000);
      const poly = L.polygon(r.polygon as [number, number][], {
        color,
        weight: selectedRegion === r.id ? 3 : 1.5,
        fillColor: color,
        fillOpacity: fill,
      });
      poly.bindTooltip(`${r.name}${regionMode ? ` · ${regionMode.toLowerCase()} risk ${(score * 100).toFixed(0)}% (${lvl})` : ` · population ≈ ${r.population.toLocaleString()} (demo estimate)`}`, { sticky: true });
      poly.on('click', () => onRegionRef.current?.(r.id));
      poly.addTo(g);
    }
  }, [ready, regions, regionMode, selectedRegion, layers]);

  /* node markers — updated in place so open popups survive live ticks */
  useEffect(() => {
    const L = LRef.current;
    const g = groups.current.nodes;
    if (!ready || !L || !g) return;
    const visible = new Set<string>();
    for (const n of nodes) {
      if (hazardFilter !== 'ALL' && n.hazard !== hazardFilter) continue;
      visible.add(n.id);
      const key = `${statusHex(n)}|${n.risk_level}|${selectedId === n.id}`;
      const existing = markers.current.get(n.id);
      if (!existing) {
        const m = L.marker([n.location.lat, n.location.lon], {
          icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: iconHtml(n, selectedId === n.id) }),
          keyboard: true,
          title: `${n.code} — ${n.health_status === 'OFFLINE' ? 'OFFLINE' : n.risk_level}`,
        });
        m.bindPopup(popupHtml(n, now), { closeButton: false, autoPan: false, offset: [0, -10] });
        m.on('mouseover', () => m.openPopup());
        m.on('mouseout', () => m.closePopup());
        m.on('click', () => onSelectRef.current?.(n.id));
        m.addTo(g);
        markers.current.set(n.id, { m, key });
      } else {
        if (existing.key !== key) {
          existing.m.setIcon(L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: iconHtml(n, selectedId === n.id) }));
          existing.key = key;
        }
        existing.m.setPopupContent(popupHtml(n, now));
        if (!g.hasLayer(existing.m)) g.addLayer(existing.m);
      }
    }
    for (const [id, { m }] of markers.current) if (!visible.has(id) && g.hasLayer(m)) g.removeLayer(m);

    if (!fitted.current && nodes.length) {
      mapRef.current?.fitBounds(L.latLngBounds(nodes.map((n) => [n.location.lat, n.location.lon] as [number, number])).pad(0.25));
      fitted.current = true;
    }
  }, [ready, nodes, hazardFilter, selectedId, now]);

  /* data overlays (risk heat, rainfall, water level, air, fire) */
  useEffect(() => {
    const L = LRef.current;
    const g = groups.current.overlay;
    if (!ready || !L || !g) return;
    g.clearLayers();
    const inFilter = (n: IrisNode) => hazardFilter === 'ALL' || n.hazard === hazardFilter;
    for (const n of nodes.filter(inFilter)) {
      if (n.health_status === 'OFFLINE') continue;
      const ll: [number, number] = [n.location.lat, n.location.lon];
      const val = (t: string) => n.sensors.find((s) => s.type === t)?.last_value;
      if (layers.has('risk') && n.risk_score > 0.08) {
        const lvl: RiskLevel = n.risk_level;
        L.circle(ll, { radius: 3500 + n.risk_score * 14000, color: RISK_META[lvl].hex, weight: 0, fillColor: RISK_META[lvl].hex, fillOpacity: 0.12 + n.risk_score * 0.3, interactive: false }).addTo(g);
      }
      const rain = val('rainfall');
      if (layers.has('rainfall') && rain !== undefined) {
        L.circle(ll, { radius: 4000 + norm('rainfall', rain) * 9000, color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12 + norm('rainfall', rain) * 0.4 }).bindTooltip(`${n.id} rainfall ${rain.toFixed(1)} mm/h`).addTo(g);
      }
      const wl = val('water_level');
      if (layers.has('water') && wl !== undefined) {
        L.circle(ll, { radius: 3000 + norm('water_level', wl) * 9000, color: '#0891b2', weight: 2, fillColor: '#06b6d4', fillOpacity: 0.1 + norm('water_level', wl) * 0.4 }).bindTooltip(`${n.id} water level ${wl.toFixed(0)} cm`).addTo(g);
      }
      const pm = val('pm25');
      if (layers.has('air') && pm !== undefined) {
        L.circle(ll, { radius: 3500 + norm('pm25', pm) * 10000, color: '#7c3aed', weight: 1, fillColor: '#8b5cf6', fillOpacity: 0.12 + norm('pm25', pm) * 0.45 }).bindTooltip(`${n.id} PM2.5 ${pm.toFixed(0)} µg/m³`).addTo(g);
      }
      if (layers.has('fire') && n.hazard === 'FIRE') {
        L.circle(ll, { radius: 3500 + n.risk_score * 11000, color: '#ea580c', weight: 1, fillColor: '#f97316', fillOpacity: 0.12 + n.risk_score * 0.5 }).bindTooltip(`${n.id} fire-risk evidence ${(n.risk_score * 100).toFixed(0)}%`).addTo(g);
      }
    }
    for (const inc of incidents.filter((i) => i.status !== 'RESOLVED')) {
      L.circle([inc.lat, inc.lon], { radius: 9000, color: RISK_META[inc.severity].hex, weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(g);
    }
  }, [ready, nodes, incidents, layers, hazardFilter]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={el} className="absolute inset-0 rounded-xl" role="application" aria-label="Live GIS map of ECO-SHIELD nodes (demo data)" />
      {tilesFailed && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
          Base-map tiles unavailable offline — overlays still live.
        </div>
      )}
      {!ready && <div className="absolute inset-0 animate-pulse rounded-xl bg-slate-200/70" aria-hidden />}
    </div>
  );
}
