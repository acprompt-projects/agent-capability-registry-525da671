"""
Lightweight client SDK for the Agent Capability Registry.

Agents use this to self-register, update profiles, and query peers by capability.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError


@dataclass
class AgentProfile:
    agent_id: str
    name: str
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    endpoint: Optional[str] = None
    registered_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "capabilities": sorted(set(self.capabilities)),
            "metadata": self.metadata,
            "endpoint": self.endpoint,
            "registered_at": self.registered_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> AgentProfile:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class RegistryClient:
    """Client for interacting with an Agent Capability Registry."""

    def __init__(
        self,
        registry_url: str,
        agent_id: Optional[str] = None,
        timeout: int = 10,
    ) -> None:
        self.registry_url = registry_url.rstrip("/")
        self.agent_id = agent_id or str(uuid.uuid4())
        self.timeout = timeout
        self._profile: Optional[AgentProfile] = None

    # -- internal helpers ---------------------------------------------------

    def _request(self, method: str, path: str, body: Optional[Dict] = None) -> Any:
        url = f"{self.registry_url}{path}"
        data = json.dumps(body).encode() if body else None
        req = Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode())
        except URLError as exc:
            raise RegistryError(f"Registry request failed: {exc}") from exc

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    # -- public API ---------------------------------------------------------

    def register(
        self,
        name: str,
        capabilities: List[str],
        endpoint: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentProfile:
        regs = self._now()
        profile = AgentProfile(
            agent_id=self.agent_id,
            name=name,
            capabilities=capabilities,
            endpoint=endpoint,
            metadata=metadata or {},
            registered_at=regs,
            updated_at=regs,
        )
        result = self._request("POST", "/agents", profile.to_dict())
        self._profile = AgentProfile.from_dict(result)
        return self._profile

    def update_profile(
        self,
        name: Optional[str] = None,
        capabilities: Optional[List[str]] = None,
        endpoint: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentProfile:
        if self._profile is None:
            raise RegistryError("Agent not registered; call register() first")
        if name is not None:
            self._profile.name = name
        if capabilities is not None:
            self._profile.capabilities = capabilities
        if endpoint is not None:
            self._profile.endpoint = endpoint
        if metadata is not None:
            self._profile.metadata.update(metadata)
        self._profile.updated_at = self._now()
        result = self._request("PUT", f"/agents/{self.agent_id}", self._profile.to_dict())
        self._profile = AgentProfile.from_dict(result)
        return self._profile

    def add_capabilities(self, *caps: str) -> AgentProfile:
        if self._profile is None:
            raise RegistryError("Agent not registered; call register() first")
        current = set(self._profile.capabilities)
        current.update(caps)
        return self.update_profile(capabilities=sorted(current))

    def remove_capabilities(self, *caps: str) -> AgentProfile:
        if self._profile is None:
            raise RegistryError("Agent not registered; call register() first")
        current = set(self._profile.capabilities) - set(caps)
        return self.update_profile(capabilities=sorted(current))

    def deregister(self) -> None:
        self._request("DELETE", f"/agents/{self.agent_id}")
        self._profile = None

    # -- query helpers ------------------------------------------------------

    def query_by_capability(self, capability: str) -> List[AgentProfile]:
        result = self._request("GET", f"/agents?capability={capability}")
        return [AgentProfile.from_dict(a) for a in result.get("agents", [])]

    def query_by_capabilities(self, *capabilities: str) -> List[AgentProfile]:
        caps = "&capability=".join(capabilities)
        result = self._request("GET", f"/agents?capability={caps}")
        return [AgentProfile.from_dict(a) for a in result.get("agents", [])]

    def get_agent(self, agent_id: str) -> AgentProfile:
        result = self._request("GET", f"/agents/{agent_id}")
        return AgentProfile.from_dict(result)

    def list_capabilities(self) -> List[str]:
        result = self._request("GET", "/capabilities")
        return result.get("capabilities", [])

    @property
    def profile(self) -> Optional[AgentProfile]:
        return self._profile


class RegistryError(Exception):
    """Raised when a registry operation fails."""