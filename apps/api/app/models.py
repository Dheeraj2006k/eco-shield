"""Pydantic data models (mirror packages/types/src/index.ts and infrastructure/database/schema.sql)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

HazardClass = Literal["FLOOD", "FIRE", "AIR", "LANDSLIDE", "WATER_QUALITY", "HEAT", "INDUSTRIAL"]
RiskLevel = Literal["NORMAL", "WATCH", "HIGH", "CRITICAL"]
ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH"]
NodeHealth = Literal["HEALTHY", "DEGRADED", "OFFLINE", "MAINTENANCE_REQUIRED"]
SensorHealth = Literal["HEALTHY", "QUESTIONABLE", "FAULT", "CALIBRATION_REQUIRED"]
SystemHealth = Literal["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "OFFLINE"]
IncidentState = Literal["WATCH", "HIGH", "CRITICAL", "ACKNOWLEDGED", "RESOLVED"]
QuorumStatus = Literal["NONE", "SUSPICIOUS", "CONFIRMED", "SUPPRESSED"]
TicketStatus = Literal["OPEN", "ASSIGNED", "IN_FIELD", "SELF_TEST", "RESOLVED"]
TicketPriority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]
TicketCategory = Literal["SENSOR_REPLACEMENT", "BATTERY", "CLEANING", "CALIBRATION", "SOLAR", "TAMPER", "CONNECTIVITY", "OTHER"]


class Sensor(BaseModel):
    id: str
    node_id: str
    type: str
    model: str
    unit: str
    health: SensorHealth
    calibration_date: str
    last_value: float
    quality_score: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    reliability_weight: float  # w = base × quality × freshness × relevance


class Node(BaseModel):
    id: str
    type: str
    location: dict
    gateway_id: str
    firmware_version: str
    model_version: str
    battery: float
    solar: float
    signal: float
    last_seen: float
    health_status: NodeHealth
    risk_level: RiskLevel
    risk_score: float
    confidence: float
    quorum: QuorumStatus
    installed_pods: list[str]
    sensors: list[Sensor] = []
    simulated: bool = True


class Telemetry(BaseModel):
    timestamp: float
    node_id: str
    sensor_id: str
    value: float
    unit: str
    quality: float
    battery: float
    signal: float


class EvidenceItem(BaseModel):
    key: str
    value: float
    weight: float
    contribution: float
    abnormal: bool
    available: bool
    detail: str


class Event(BaseModel):
    id: str
    node_id: str
    hazard: HazardClass
    timestamp: float
    severity: RiskLevel
    confidence: float
    evidence: list[EvidenceItem]
    sensor_health: dict[str, str]
    model_versions: dict[str, str]


class Incident(BaseModel):
    id: str
    key: str
    event_ids: list[str]
    hazard: HazardClass
    severity: RiskLevel
    confidence: float
    confidence_level: ConfidenceLevel
    state: IncidentState
    location: str
    status: Literal["ACTIVE", "ACKNOWLEDGED", "RESOLVED"]
    recommended_action: str
    created_at: float
    resolved_at: float | None = None
    acknowledged_by: str | None = None
    node_ids: list[str]
    detections: int
    duplicates_suppressed: int
    decision_support_note: str = "Decision support — not autonomous emergency command."
    simulated: bool = True


class Maintenance(BaseModel):
    ticket_id: str
    node_id: str
    issue: str
    category: TicketCategory
    priority: TicketPriority
    assigned_to: str
    status: TicketStatus
    created_at: float
    resolved_at: float | None = None
    service_history: list[dict] = []


class TicketCreate(BaseModel):
    node_id: str = Field(min_length=3, max_length=32, pattern=r"^[A-Z]{3}-\d{3}$")
    issue: str = Field(min_length=5, max_length=200)
    category: TicketCategory = "OTHER"
    priority: TicketPriority = "MEDIUM"


class AckRequest(BaseModel):
    note: str | None = Field(default=None, max_length=200)
