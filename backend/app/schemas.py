from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MarketTickerQuote(BaseModel):
    code: str
    name: str
    price: float | None = None
    changePct: float | None = None


class MarketCard(BaseModel):
    code: str
    name: str
    kind: Literal['index', 'rate', 'fx', 'gold']
    price: float | None = None
    change: float | None = None
    changePct: float | None = None
    note: str | None = None


class MarketSeriesPoint(BaseModel):
    label: str
    isoTime: str
    price: float
    volume: float = 0.0


class MarketSeries(BaseModel):
    granularity: Literal['intraday', 'daily', 'none']
    points: list[MarketSeriesPoint] = Field(default_factory=list)
    note: str | None = None


class HomeMarketPayload(BaseModel):
    updatedAt: datetime
    tickerStrip: list[MarketTickerQuote] = Field(default_factory=list)
    marketCards: list[MarketCard] = Field(default_factory=list)
    importantCards: list[MarketCard] = Field(default_factory=list)
    seriesByCode: dict[str, MarketSeries] = Field(default_factory=dict)


class StrategyPermissionSet(BaseModel):
    allowBacktest: bool = False
    allowLive: bool = False
    allowThirdParty: bool = False
    backtestStrategyIds: list[str] = Field(default_factory=list)
    liveStrategyIds: list[str] = Field(default_factory=list)
    thirdPartyStrategyIds: list[str] = Field(default_factory=list)


class AuthUserResponse(BaseModel):
    id: str
    username: str
    fullName: str
    organization: str
    email: str
    contact: str
    role: Literal['user', 'admin']
    token: str
    registeredAt: str
    permissions: StrategyPermissionSet


class RegistrationPayload(BaseModel):
    username: str
    password: str
    fullName: str
    organization: str
    email: str
    contact: str


class RegistrationRequestResponse(BaseModel):
    id: str
    username: str
    fullName: str
    organization: str
    email: str
    contact: str
    requestedAt: str


class LoginPayload(BaseModel):
    username: str
    password: str


class StrategyMutationPayload(BaseModel):
    strategy: dict


class StrategyMovePayload(BaseModel):
    fromChannel: Literal['backtest', 'live', 'thirdparty']
    toChannel: Literal['backtest', 'live', 'thirdparty']
    strategyId: str


class PermissionsPayload(BaseModel):
    permissions: StrategyPermissionSet


class HomeHeroImage(BaseModel):
    id: str
    src: str
    sourceType: Literal['default', 'custom']


class HomeSiteContent(BaseModel):
    heroImages: list[HomeHeroImage] = Field(default_factory=list)


class AppBootstrapPayload(BaseModel):
    strategies: dict[str, list[dict]] = Field(default_factory=dict)
    pendingRequests: list[RegistrationRequestResponse] = Field(default_factory=list)
    managedUsers: list[AuthUserResponse] = Field(default_factory=list)
    siteContent: HomeSiteContent


class AnalyticsVisitCounter(BaseModel):
    count: int = 0
    lastVisitedAt: str


class AnalyticsStrategyVisitCounter(AnalyticsVisitCounter):
    channel: Literal['backtest', 'live', 'thirdparty']
    strategyId: str
    strategyName: str


class AnalyticsPermissionOpenLog(BaseModel):
    id: str
    action: Literal['approve', 'update']
    targetUserId: str
    targetUsername: str
    summary: str
    timestamp: str


class AnalyticsSnapshotResponse(BaseModel):
    version: int
    moduleVisits: dict[str, AnalyticsVisitCounter] = Field(default_factory=dict)
    strategyVisits: dict[str, AnalyticsStrategyVisitCounter] = Field(default_factory=dict)
    permissionOpens: list[AnalyticsPermissionOpenLog] = Field(default_factory=list)


class ModuleVisitPayload(BaseModel):
    pathname: str
    actorRole: Literal['guest', 'user', 'admin'] | None = None


class StrategyVisitPayload(BaseModel):
    channel: Literal['backtest', 'live', 'thirdparty']
    strategyId: str
    strategyName: str
    actorRole: Literal['guest', 'user', 'admin'] | None = None


class PermissionOpenPayload(BaseModel):
    action: Literal['approve', 'update']
    targetUserId: str
    targetUsername: str
    summary: str
