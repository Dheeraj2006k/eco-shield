import {
  BarChart3,
  Gauge,
  BrainCircuit,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  Map,
  Network,
  PlayCircle,
  Radio,
  ScanEye,
  Settings,
  Siren,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Capability } from '@iris/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  cap?: Capability;
  mobile?: boolean;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, mobile: true },
  { href: '/map', label: 'Live Map', icon: Map, mobile: true },
  { href: '/nodes', label: 'Nodes', icon: Radio, mobile: true },
  { href: '/alerts', label: 'Alerts', icon: Siren, mobile: true },
  { href: '/ai', label: 'AI Intelligence', icon: BrainCircuit },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/insights', label: 'Insights', icon: Gauge },
  { href: '/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/simulation', label: 'Simulation', icon: FlaskConical },
  { href: '/vision', label: 'Vision AI', icon: ScanEye },
  { href: '/architecture', label: 'Architecture', icon: Network },
  { href: '/hardware', label: 'Hardware', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: Settings, cap: 'settings' },
];

export const DEMO_NAV: NavItem = { href: '/demo', label: 'Demo Control', icon: PlayCircle, cap: 'simulate' };
