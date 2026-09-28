import { Badge, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import { PageHeader } from '@/components/common/widgets';

const GROUPS: { title: string; tag?: string; note?: string; items: { part: string; role: string; measures?: string }[] }[] = [
  {
    title: 'HYDRO / FLOOD POD',
    items: [
      { part: 'DFRobot A02YYUW', role: 'Ultrasonic distance sensor', measures: 'Water level' },
      { part: 'DFRobot SEN0575', role: 'Tipping-bucket rain gauge', measures: 'Rainfall' },
      { part: 'DHT22 / SHT31', role: 'Temperature & humidity', measures: 'Temperature / humidity' },
    ],
  },
  {
    title: 'FIRE / AIR POD',
    items: [
      { part: 'Sensirion SPS30', role: 'Laser particulate sensor', measures: 'PM2.5 / PM10' },
      { part: 'MQ-2', role: 'Metal-oxide gas sensor', measures: 'Smoke / combustible gas' },
      { part: 'DHT22 / SHT31', role: 'Temperature & humidity', measures: 'Temperature / humidity' },
    ],
  },
  {
    title: 'UNIVERSAL CORE',
    items: [
      { part: 'ESP32-S3 WROOM-1 / N16R8', role: 'Node MCU running AI-0' },
      { part: 'Seeed Wio-E5', role: 'LoRa-E5 LoRaWAN radio' },
      { part: 'LiFePO4 IFR26650', role: 'Storage cell' },
      { part: 'Solar 6V/9V 5–10 W', role: 'Energy harvesting' },
      { part: 'TP5000', role: 'Charge controller' },
      { part: 'IP65 enclosure', role: 'Weather-proof housing with replaceable-pod interface' },
    ],
  },
  {
    title: 'GATEWAY',
    tag: 'Prototype: Raspberry Pi 5',
    items: [
      { part: 'Raspberry Pi 4 / 5', role: 'Edge AI-1 host (prototype: Raspberry Pi 5)' },
      { part: 'LoRa receiver / concentrator', role: 'LoRaWAN uplink reception' },
    ],
  },
  {
    title: 'VISION',
    tag: 'Optional',
    items: [
      { part: 'Camera module', role: 'Local visual verification (frames stay on the edge network)' },
      { part: 'Raspberry Pi AI HAT+ (optional)', role: 'Accelerates RTMDet / MobileNetV3-Small at the prototype gateway' },
    ],
  },
  {
    title: 'HIGH-COMPUTE / PRODUCTION TARGET',
    tag: 'Not required for every gateway',
    note: 'Qualcomm Dragonwing IQ-8275 is the high-compute / production target for sites that need heavier vision or multi-camera inference. Standard gateways can use the Raspberry Pi class prototype hardware.',
    items: [{ part: 'Qualcomm Dragonwing IQ-8275', role: 'High-compute edge platform for heavier inference workloads' }],
  },
];

export default function HardwarePage() {
  return (
    <>
      <PageHeader title="Hardware catalog" subtitle="Replaceable sensor pods plus one universal core. Parts listed are the design bill of materials; the demo app itself runs on simulated telemetry." demo={false} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardHeader><CardTitle>{g.title}</CardTitle>{g.tag && <Badge tone="info">{g.tag}</Badge>}</CardHeader>
            <CardContent>
              {g.note && <p className="mb-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{g.note}</p>}
              <ul className="space-y-2">
                {g.items.map((i) => (
                  <li key={i.part} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-900">{i.part}</p>
                    <p className="text-xs text-slate-600">{i.role}</p>
                    {i.measures && <p className="mt-0.5 text-xs font-medium text-navy-700">Measures: {i.measures}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
