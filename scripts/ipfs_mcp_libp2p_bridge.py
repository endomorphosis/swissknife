#!/usr/bin/env python3
"""Expose a live HTTP MCP registry through MCP++ Profile E libp2p transport."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import signal
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import trio
from libp2p import new_host
from libp2p.tools.async_service import background_trio_service
from multiaddr import Multiaddr

from ipfs_accelerate_py.p2p_tasks.mcp_p2p import read_u32_framed_json
from ipfs_accelerate_py.p2p_tasks.mcp_p2p_protocol import PROTOCOL_MCP_P2P_V1


MCP_PROTOCOL_VERSION = "2024-11-05"
PROFILE_E_CAPABILITY = "mcp++/p2p-transport"
PROFILE_A_CAPABILITY = "mcp++/mcp-idl"
PROFILE_B_CAPABILITY = "mcp++/cid-envelope"
PROFILE_C_CAPABILITY = "mcp++/ucan"
PROFILE_F_CAPABILITY = "mcp++/event-dag"
PROFILE_H_CAPABILITY = "mcp++/x402-payments"
PROFILE_H_VERSION = "1.0"
PROFILE_H_METHODS = {
    "mcp++/payments/profile", "mcp++/payments/catalog", "mcp++/payments/quote",
    "mcp++/payments/verify", "mcp++/payments/settle", "mcp++/payments/receipt/get",
    "mcp++/payments/entitlement/get", "mcp++/payments/usage/get",
    "mcp++/payments/refund/request", "mcp++/payments/reconcile",
}
MAX_FRAME_BYTES = 16 * 1024 * 1024
MAX_FRAMES_PER_SESSION = 200
# py-libp2p's Noise implementation accepts plaintext writes no larger than
# 65,535 bytes. Keep framed JSON-RPC writes below that boundary; receivers
# already reassemble the u32-prefixed frame from arbitrary stream chunks.
MAX_LIBP2P_WRITE_BYTES = 60 * 1024
BRIDGE_PROFILE_E_VERSION = "1.8.0"
DEFAULT_ARTIFACT_STORE_DIR = os.path.join(
    os.path.expanduser("~"), ".cache", "swissknife", "mcpplusplus-artifacts"
)
DEFAULT_IPFS_KIT_ARTIFACT_ENDPOINT = "http://127.0.0.1:8014/mcp/artifacts"

class ProfileHRemoteError(RuntimeError):
    """A seller JSON-RPC error that must survive the HTTP/libp2p boundary."""
    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code, self.data = code, data


def is_ready_profile_h(profile: Any) -> bool:
    """Accept only a complete, durable, explicitly labelled Profile H seller."""
    if not isinstance(profile, dict) or profile.get("profile") != PROFILE_H_CAPABILITY \
            or profile.get("version") != PROFILE_H_VERSION or profile.get("ready") is not True \
            or not isinstance(profile.get("sellerDid"), str) or not profile.get("sellerDid") \
            or not isinstance(profile.get("catalogCid"), str) or not profile.get("catalogCid"):
        return False
    methods, transports = profile.get("methods"), profile.get("transports")
    durability, facilitator = profile.get("durability"), profile.get("facilitator")
    if not isinstance(methods, list) or not PROFILE_H_METHODS.issubset(set(methods)) \
            or not isinstance(transports, list) or not {"http", "libp2p"}.issubset(set(transports)) \
            or not isinstance(durability, dict) or durability.get("ledger") != "durable" \
            or durability.get("artifactStore") != "content-addressed" or durability.get("reconciliation") is not True \
            or not isinstance(facilitator, dict) or facilitator.get("ready") is not True:
        return False
    mode, upstream = profile.get("mode"), profile.get("upstreamX402HttpConformance")
    return (mode == "local-test" and upstream is False) or (mode == "facilitator" and upstream is True)


async def write_chunked_jsonrpc_frame(stream: Any, message: dict[str, Any]) -> None:
    """Write one JSON-RPC frame without exceeding the Noise write limit."""

    body = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(body) > MAX_FRAME_BYTES:
        raise ValueError(f"JSON-RPC frame exceeds {MAX_FRAME_BYTES} bytes")
    frame = len(body).to_bytes(4, "big") + body
    for offset in range(0, len(frame), MAX_LIBP2P_WRITE_BYTES):
        await stream.write(frame[offset:offset + MAX_LIBP2P_WRITE_BYTES])


class HttpMcpRegistry:
    """Registry facade used by the SwissKnife MCP++ Profile E handler."""

    def __init__(self, service: str, endpoint: str) -> None:
        self.service = service
        self.endpoint = endpoint.rstrip("/")
        self.tools: dict[str, dict[str, Any]] = {}
        self.profile_h_profile: dict[str, Any] | None = None
        self.profile_h_profile: dict[str, Any] | None = None

    async def refresh(self) -> None:
        response = await self._rpc("tools/list", {})
        rows = response.get("result", {}).get("tools", [])
        if not isinstance(rows, list) or not rows:
            raise RuntimeError(f"{self.service} returned no tools from {self.endpoint}")
        self.tools = {
            str(tool["name"]): {
                "name": str(tool["name"]),
                "description": str(tool.get("description") or ""),
                "input_schema": tool.get("inputSchema") or tool.get("input_schema") or {"type": "object", "additionalProperties": True},
                "output_schema": tool.get("outputSchema") or tool.get("output_schema") or {"type": "object", "additionalProperties": True},
            }
            for tool in rows
            if isinstance(tool, dict) and tool.get("name")
        }
        if not self.tools:
            raise RuntimeError(f"{self.service} returned no named tools from {self.endpoint}")
        self.profile_h_profile = None
        try:
            profile_response = await self._rpc("mcp++/payments/profile", {})
            profile = profile_response.get("result") if isinstance(profile_response, dict) else None
            if is_ready_profile_h(profile):
                self.profile_h_profile = profile
        except Exception:
            # Profile H is optional; ordinary MCP tools remain available.
            self.profile_h_profile = None

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        if tool_name not in self.tools:
            raise ValueError(f"unknown tool: {tool_name}")
        response = await self._rpc("tools/call", {"name": tool_name, "arguments": arguments})
        if response.get("error"):
            raise RuntimeError(str(response["error"].get("message") or "remote MCP error"))
        return response.get("result", response)

    async def profile_c(self, method: str, params: dict[str, Any]) -> Any:
        """Forward Profile C to the paired HTTP backend without changing UCAN bytes."""

        response = await self._rpc(method, params)
        if response.get("error"):
            raise RuntimeError(str(response["error"].get("message") or "remote Profile C error"))
        return response.get("result", response)

    async def event_dag(self, method: str, params: dict[str, Any]) -> Any:
        """Forward named Profile F Event DAG operations to the HTTP authority."""

        response = await self._rpc(method, params)
        if response.get("error"):
            raise RuntimeError(str(response["error"].get("message") or "remote Event DAG error"))
        return response.get("result", response)

    async def profile_h(self, method: str, params: dict[str, Any]) -> Any:
        """Forward Profile H without changing payment proofs or seller artifacts."""
        if method not in PROFILE_H_METHODS:
            raise ValueError(f"unsupported Profile H method: {method}")
        if self.profile_h_profile is None:
            raise ProfileHRemoteError(-32070, "MCP++ Profile H is unavailable for this seller.",
                                      {"code": "H_PROFILE_UNAVAILABLE", "service": self.service})
        response = await self._rpc(method, params)
        error = response.get("error") if isinstance(response, dict) else None
        if isinstance(error, dict):
            code = error.get("code") if isinstance(error.get("code"), int) else -32070
            raise ProfileHRemoteError(code, str(error.get("message") or "remote Profile H error"), error.get("data"))
        return response.get("result", response)

    async def authorize_profile_c_execution(self, params: dict[str, Any], tool: str) -> None:
        """Validate a supplied UCAN before Profile B invokes an upstream tool."""

        proof_cid = params.get("proof_cid") if isinstance(params.get("proof_cid"), str) else ""
        ucan = params.get("ucan") if isinstance(params.get("ucan"), str) else None
        if not proof_cid and not ucan:
            if os.environ.get("MCPPLUSPLUS_REQUIRE_UCAN") == "1":
                raise ValueError("This server requires a Profile C UCAN proof for execution.")
            return
        result = await self.profile_c("mcp++/ucan/validate", {
            "proof_cid": proof_cid,
            "ucan": ucan,
            "audience": params.get("ucan_audience"),
            "required_capability": {
                "resource": f"mcp++://{self.service}/tool/{tool}",
                "ability": "mcp++/invoke",
            },
        })
        if not isinstance(result, dict) or result.get("valid") is not True:
            reason = result.get("reason") if isinstance(result, dict) else None
            raise ValueError(str(reason or "UCAN verification failed."))

    def profile_a_catalog(self) -> dict[str, Any]:
        """Build one canonical MCP-IDL contract for the live service registry."""

        default_schema = {"type": "object", "additionalProperties": True}
        methods: list[dict[str, Any]] = []
        for tool in sorted(self.tools.values(), key=lambda item: str(item["name"])):
            input_schema = tool.get("input_schema") or default_schema
            output_schema = tool.get("output_schema") or default_schema
            methods.append({
                "name": tool["name"],
                "description": tool.get("description") or "",
                "input_schema": input_schema,
                "output_schema": output_schema,
                "input_schema_cid": self._cid_for_value(input_schema),
                "output_schema_cid": self._cid_for_value(output_schema),
                "error_schema_cids": [],
                "errors": ["MCPError"],
                "streaming": False,
                "interaction_pattern": "request-response",
            })
        descriptor = {
            "name": f"{self.service}.mcp-tools",
            "namespace": f"org.hallucinate.swissknife.mcp.{self.service}",
            "version": "1.0.0",
            "methods": methods,
            "errors": ["MCPError"],
            "requires": [],
            "compatibility": {"compatible_with": [], "supersedes": []},
            "semantic_tags": ["mcp", "mcp-idl", "ipfs", self.service],
            "observability": {"trace": True, "provenance": True},
            "interaction_patterns": {"request_response": True, "event_streams": False},
            "resource_cost_hints": {"tokens_per_call": 0, "latency_ms": 0},
        }
        canonical = self._canonical_json(descriptor)
        interface_cid = self._cid_for_bytes(canonical)
        return {
            "interface_cid": interface_cid,
            "descriptor": {**descriptor, "interface_cid": interface_cid},
            "canonical_descriptor": descriptor,
            "canonical_bytes_base64": base64.b64encode(canonical).decode("ascii"),
        }

    @staticmethod
    def _canonical_json(value: Any) -> bytes:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

    @staticmethod
    def _cid_for_bytes(value: bytes) -> str:
        digest = hashlib.sha256(value).digest()
        return "b" + base64.b32encode(b"\x01\x55\x12\x20" + digest).decode("ascii").lower().rstrip("=")

    @classmethod
    def _cid_for_value(cls, value: Any) -> str:
        return cls._cid_for_bytes(cls._canonical_json(value))

    @staticmethod
    def _is_content_cid(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        import re
        return re.fullmatch(r"(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})", value) is not None

    async def execute_profile_b(self, params: dict[str, Any]) -> dict[str, Any]:
        """Execute one live tool and return draft Profile B CID artifacts."""

        catalog = self.profile_a_catalog()
        interface_cid = str(params.get("interface_cid") or "")
        if interface_cid != catalog["interface_cid"] or not self._is_content_cid(interface_cid):
            raise ValueError("mcp++/execute requires the service Profile A interface_cid.")
        tool = str(params.get("tool") or params.get("name") or "")
        method = next((item for item in catalog["descriptor"]["methods"] if item["name"] == tool), None)
        if method is None:
            raise ValueError(f"Unknown tool for Profile B execution: {tool}")
        await self.authorize_profile_c_execution(params, tool)
        arguments = params.get("arguments", params.get("input", {}))
        if not isinstance(arguments, dict):
            raise ValueError("mcp++/execute arguments must be an object.")
        parents = params.get("parents", [])
        if not isinstance(parents, list) or not all(self._is_content_cid(parent) for parent in parents):
            raise ValueError("Profile B parents must be valid CIDs.")
        timestamp = params.get("timestamp")
        if not isinstance(timestamp, (str, int, float)):
            timestamp = datetime.now(timezone.utc).isoformat()
        proof_cid = params.get("proof_cid")
        policy_cid = params.get("policy_cid")
        if proof_cid is not None and not self._is_content_cid(proof_cid):
            raise ValueError("proof_cid must be a valid CID.")
        if policy_cid is not None and not self._is_content_cid(policy_cid):
            raise ValueError("policy_cid must be a valid CID.")
        input_value = {
            "schema": "mcp++/profile-b-execution@1",
            "interface_cid": interface_cid,
            "tool": tool,
            "arguments": arguments,
        }
        input_cid = self._cid_for_value(input_value)
        correlation_id = params.get("correlation_id") if isinstance(params.get("correlation_id"), str) else f"profile-b:{tool}"
        intent = {
            "schema": "mcp++/profile-b-execution@1",
            "interface_cid": interface_cid,
            "tool": tool,
            "input_cid": input_cid,
            "expected_output_schema_cid": method["output_schema_cid"],
            "policy_cid": policy_cid,
            "proof_cid": proof_cid,
            "parents": parents,
            "correlation_id": correlation_id,
        }
        intent_cid = self._cid_for_value(intent)
        envelope = {
            "interface_cid": interface_cid,
            "input_cid": input_cid,
            "parents": parents,
            "timestamp": timestamp,
            "metadata": {
                "schema": "mcp++/profile-b-execution@1",
                "intent_cid": intent_cid,
                "tool": tool,
                "expected_output_schema_cid": method["output_schema_cid"],
                "policy_cid": policy_cid,
                "proof_cid": proof_cid,
                "correlation_id": correlation_id,
            },
        }
        envelope_cid = self._cid_for_value(envelope)
        started_at = time.monotonic()
        execution_error: str | None = None
        try:
            output = await self.call_tool(tool, arguments)
        except Exception as exc:
            execution_error = str(exc)
            output = {"isError": True, "error": execution_error}
        success = execution_error is None and not (isinstance(output, dict) and output.get("isError") is True)
        output_cid = self._cid_for_value(output)
        receipt_artifact = {
            "schema": "mcp++/profile-b-execution@1",
            "success": success,
            "envelope_cid": envelope_cid,
            "output_cid": output_cid,
            "error": execution_error,
            "timestamp": timestamp,
        }
        receipt_cid = self._cid_for_value(receipt_artifact)
        event = {
            "schema": "mcp++/profile-b-execution@1",
            "parents": parents,
            "interface_cid": interface_cid,
            "intent_cid": intent_cid,
            "envelope_cid": envelope_cid,
            "output_cid": output_cid,
            "receipt_cid": receipt_cid,
            "timestamp": timestamp,
        }
        event_cid = self._cid_for_value(event)
        artifact_persistence: dict[str, Any] | None = None
        persistence_error: str | None = None
        try:
            await self.persist_profile_a(catalog)
            artifact_persistence = await self.persist_profile_b(
                input_value=input_value,
                input_cid=input_cid,
                intent=intent,
                intent_cid=intent_cid,
                envelope=envelope,
                envelope_cid=envelope_cid,
                output=output,
                output_cid=output_cid,
                receipt_artifact=receipt_artifact,
                receipt_cid=receipt_cid,
                event=event,
                event_cid=event_cid,
            )
        except Exception as exc:
            persistence_error = str(exc)
        return {
            "output": output,
            "envelope": envelope,
            "envelope_cid": envelope_cid,
            "intent_cid": intent_cid,
            "input_cid": input_cid,
            "output_cid": output_cid,
            "event": event,
            "event_cid": event_cid,
            "receipt_artifact": receipt_artifact,
            "artifact_persistence": artifact_persistence,
            "receipt": {
                "success": success,
                "receipt_cid": receipt_cid,
                "output_cid": output_cid,
                "envelope_cid": envelope_cid,
                "error": execution_error,
                "duration_ms": int((time.monotonic() - started_at) * 1000),
                "persistence_error": persistence_error,
            },
        }

    @property
    def _artifact_store_dir(self) -> Path:
        return Path(os.environ.get("MCPPLUSPLUS_ARTIFACT_STORE_DIR", DEFAULT_ARTIFACT_STORE_DIR))

    async def persist_profile_a(self, catalog: dict[str, Any]) -> dict[str, Any]:
        artifact = await self.persist_artifact(
            profile="A",
            kind="interface_descriptor",
            cid=catalog["interface_cid"],
            raw=self._canonical_json(catalog["canonical_descriptor"]),
        )
        return {
            "profile": "A",
            "complete": artifact.get("persisted") is True and artifact.get("verified") is True,
            "interface_descriptor": artifact,
        }

    async def persist_profile_b(
        self,
        *,
        input_value: dict[str, Any],
        input_cid: str,
        intent: dict[str, Any],
        intent_cid: str,
        envelope: dict[str, Any],
        envelope_cid: str,
        output: Any,
        output_cid: str,
        receipt_artifact: dict[str, Any],
        receipt_cid: str,
        event: dict[str, Any],
        event_cid: str,
    ) -> dict[str, Any]:
        rows = [
            await self.persist_artifact(profile="B", kind="input", cid=input_cid, raw=self._canonical_json(input_value)),
            await self.persist_artifact(profile="B", kind="intent", cid=intent_cid, raw=self._canonical_json(intent)),
            await self.persist_artifact(profile="B", kind="envelope", cid=envelope_cid, raw=self._canonical_json(envelope)),
            await self.persist_artifact(profile="B", kind="output", cid=output_cid, raw=self._canonical_json(output)),
            await self.persist_artifact(profile="B", kind="receipt", cid=receipt_cid, raw=self._canonical_json(receipt_artifact)),
            await self.persist_artifact(profile="B", kind="event", cid=event_cid, raw=self._canonical_json(event)),
        ]
        artifacts = {row["kind"]: row for row in rows}
        return {
            "profile": "B",
            "complete": all(row.get("persisted") is True and row.get("verified") is True for row in rows),
            "artifacts": artifacts,
        }

    async def persist_artifact(self, *, profile: str, kind: str, cid: str, raw: bytes) -> dict[str, Any]:
        if self._cid_for_bytes(raw) != cid:
            raise ValueError(f"Artifact {kind} CID does not match canonical bytes.")
        attempts: list[dict[str, str]] = []
        try:
            stored = await trio.to_thread.run_sync(
                self._put_via_ipfs_kit, cid, raw, profile, kind
            )
            return {**stored, "profile": profile, "kind": kind, "service": self.service, "attempts": attempts}
        except Exception as exc:
            attempts.append({"backend": "ipfs_kit_py", "error": str(exc)})
        stored = await trio.to_thread.run_sync(self._put_disk, cid, raw, profile, kind)
        return {**stored, "profile": profile, "kind": kind, "service": self.service, "attempts": attempts}

    def _put_via_ipfs_kit(self, cid: str, raw: bytes, profile: str, kind: str) -> dict[str, Any]:
        endpoint = os.environ.get("MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL", DEFAULT_IPFS_KIT_ARTIFACT_ENDPOINT).rstrip("/")
        payload = json.dumps({
            "cid": cid,
            "bytes_base64": base64.b64encode(raw).decode("ascii"),
            "profile": profile,
            "kind": kind,
            "service": self.service,
            "pin": True,
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{endpoint}/put",
            data=payload,
            headers={"content-type": "application/json", "accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
        if result.get("persisted") is not True or result.get("verified") is not True or result.get("cid") != cid:
            raise RuntimeError(result.get("error") or "ipfs_kit_py did not verify the artifact")
        result["via"] = "ipfs_kit_py"
        return result

    def _put_disk(self, cid: str, raw: bytes, profile: str, kind: str) -> dict[str, Any]:
        root = self._artifact_store_dir
        block_path = root / "blocks" / cid
        metadata_path = root / "metadata" / f"{cid}.json"
        block_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = block_path.with_name(f"{block_path.name}.{os.getpid()}.tmp")
        temporary.write_bytes(raw)
        temporary.replace(block_path)
        read_back = block_path.read_bytes()
        if read_back != raw or self._cid_for_bytes(read_back) != cid:
            raise RuntimeError("Disk cache did not verify artifact")
        metadata_path.write_text(json.dumps({
            "schema": "swissknife.mcpplusplus.artifact-metadata.v1",
            "cid": cid,
            "profile": profile,
            "kind": kind,
            "service": self.service,
            "bytes": len(raw),
            "pinned": True,
            "stored_at": datetime.now(timezone.utc).isoformat(),
        }, indent=2) + "\n", encoding="utf-8")
        return {
            "persisted": True,
            "verified": True,
            "backend": "disk",
            "cid": cid,
            "bytes": len(raw),
            "uri": f"ipfs://{cid}",
            "cache_path": str(Path("~/.cache/swissknife/mcpplusplus-artifacts/blocks") / cid),
            "pinned": True,
        }

    async def get_artifact(self, cid: str) -> dict[str, Any]:
        if not self._is_content_cid(cid):
            raise ValueError("Artifact CID must be a valid content CID.")
        return await trio.to_thread.run_sync(self._get_artifact_sync, cid)

    def _get_artifact_sync(self, cid: str) -> dict[str, Any]:
        try:
            endpoint = os.environ.get("MCPPLUSPLUS_IPFS_KIT_ARTIFACT_URL", DEFAULT_IPFS_KIT_ARTIFACT_ENDPOINT).rstrip("/")
            request = urllib.request.Request(
                f"{endpoint}/{urllib.parse.quote(cid)}",
                headers={"accept": "application/json"},
                method="GET",
            )
            with urllib.request.urlopen(request, timeout=5) as response:
                result = json.loads(response.read().decode("utf-8"))
            if result.get("found") is not True or result.get("verified") is not True or result.get("cid") != cid:
                raise RuntimeError(result.get("error") or "ipfs_kit_py did not return a verified artifact")
            raw = base64.b64decode(str(result.get("bytes_base64") or ""), validate=True)
            if self._cid_for_bytes(raw) != cid:
                raise RuntimeError("ipfs_kit_py returned bytes for a different CID")
            return {
                "found": True,
                "verified": True,
                "backend": result.get("backend") or "ipfs_kit_py",
                "cid": cid,
                "bytes_base64": base64.b64encode(raw).decode("ascii"),
                "via": "ipfs_kit_py",
            }
        except Exception as exc:
            block_path = self._artifact_store_dir / "blocks" / cid
            if block_path.exists():
                raw = block_path.read_bytes()
                if self._cid_for_bytes(raw) == cid:
                    return {
                        "found": True,
                        "verified": True,
                        "backend": "disk",
                        "cid": cid,
                        "bytes_base64": base64.b64encode(raw).decode("ascii"),
                    }
            return {"found": False, "verified": False, "cid": cid, "error": str(exc)}

    async def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        return await trio.to_thread.run_sync(self._post_json, payload)

    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json", "accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} from {self.endpoint}: {text[:300]}") from exc


async def handle_profile_e_stream(
    stream: Any,
    *,
    registry: HttpMcpRegistry,
    local_peer_id: str,
    multiaddr: str,
) -> None:
    """Serve canonical MCP++ Profiles A, B, C, E, and F over libp2p.

    The three configured backends expose MCP tools over HTTP. This bridge gives
    them one honest Profile A/E surface rather than forwarding the upstream
    service's legacy custom handshake.
    """

    initialized = False
    profile_h_negotiated = False
    frame_count = 0
    write_lock = trio.Lock()

    async def reply(message: dict[str, Any]) -> None:
        async with write_lock:
            await write_chunked_jsonrpc_frame(stream, message)

    async def tool_call(request_id: Any, name: str, arguments: dict[str, Any]) -> None:
        try:
            result = await registry.call_tool(name, arguments)
            await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
        except ValueError as exc:
            await reply({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32602, "message": str(exc)},
            })
        except Exception as exc:  # The HTTP backend is a remote execution boundary.
            await reply({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32603, "message": f"tool execution failed: {exc}"},
            })

    try:
        async with trio.open_nursery() as nursery:
            while True:
                message, error = await read_u32_framed_json(stream, max_frame_bytes=MAX_FRAME_BYTES)
                if message is None:
                    if error not in {"empty", "eof"}:
                        await reply({
                            "jsonrpc": "2.0",
                            "id": None,
                            "error": {"code": -32700, "message": f"invalid framed JSON-RPC message: {error}"},
                        })
                    break

                frame_count += 1
                if frame_count > MAX_FRAMES_PER_SESSION:
                    await reply({
                        "jsonrpc": "2.0",
                        "id": message.get("id"),
                        "error": {"code": -32000, "message": "session frame limit exceeded"},
                    })
                    break

                request_id = message.get("id")
                is_request = request_id is not None
                method = message.get("method")
                params = message.get("params", {})
                if message.get("jsonrpc") != "2.0" or not isinstance(method, str) or not isinstance(params, dict):
                    if is_request:
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32600, "message": "invalid JSON-RPC request"},
                        })
                    continue

                if not initialized:
                    if method != "initialize":
                        if is_request:
                            await reply({
                                "jsonrpc": "2.0",
                                "id": request_id,
                                "error": {"code": -32002, "message": "initialize must complete before requests"},
                            })
                        continue
                    if not is_request:
                        continue
                    if params.get("protocolVersion") != MCP_PROTOCOL_VERSION:
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": f"unsupported protocol version: {params.get('protocolVersion')}"},
                        })
                        continue
                    initialized = True
                    requested_experimental = params.get("capabilities", {}).get("experimental", {})
                    if not isinstance(requested_experimental, dict):
                        requested_experimental = {}
                    experimental = {PROFILE_E_CAPABILITY: True}
                    if requested_experimental.get(PROFILE_A_CAPABILITY) is True:
                        experimental[PROFILE_A_CAPABILITY] = True
                    if requested_experimental.get(PROFILE_B_CAPABILITY) is True:
                        experimental[PROFILE_B_CAPABILITY] = True
                    if requested_experimental.get(PROFILE_C_CAPABILITY) is True:
                        experimental[PROFILE_C_CAPABILITY] = True
                    if requested_experimental.get(PROFILE_F_CAPABILITY) is True:
                        experimental[PROFILE_F_CAPABILITY] = True
                    profile_h_negotiated = bool(registry.profile_h_profile is not None
                                                and requested_experimental.get(PROFILE_H_CAPABILITY) is True)
                    if profile_h_negotiated:
                        experimental[PROFILE_H_CAPABILITY] = True
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "protocolVersion": MCP_PROTOCOL_VERSION,
                            "serverInfo": {
                                "name": f"swissknife-{registry.service}-profile-e-bridge",
                                "version": "1.0.0",
                            },
                            "capabilities": {
                                "tools": {"listChanged": True},
                                "experimental": experimental,
                            },
                        },
                    })
                    continue

                if method == "notifications/initialized":
                    continue
                if not is_request:
                    continue
                if method == "tools/list":
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {"tools": list(registry.tools.values())},
                    })
                    continue
                if method == "interfaces/list":
                    catalog = registry.profile_a_catalog()
                    await registry.persist_profile_a(catalog)
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "interfaces": [catalog["interface_cid"]],
                            "interface_cids": [catalog["interface_cid"]],
                        },
                    })
                    continue
                if method == "interfaces/get":
                    catalog = registry.profile_a_catalog()
                    if params.get("interface_cid") != catalog["interface_cid"]:
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "Unknown interface_cid"},
                        })
                    else:
                        persistence = await registry.persist_profile_a(catalog)
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "result": {**catalog, "artifact_persistence": persistence},
                        })
                    continue
                if method == "interfaces/compat":
                    catalog = registry.profile_a_catalog()
                    server_cid = params.get("server_cid") or params.get("interface_cid") or ""
                    client_cid = params.get("client_cid") or server_cid
                    compatible = client_cid == catalog["interface_cid"] and server_cid == catalog["interface_cid"]
                    reasons = [] if compatible else ["Interface CID is not available from this service."]
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "compatible": compatible,
                            "reasons": reasons,
                            "requires_missing": [],
                            "suggested_alternatives": [],
                            "requiresMissing": [],
                            "suggestedAlternatives": [],
                        },
                    })
                    continue
                if method == "interfaces/select":
                    catalog = registry.profile_a_catalog()
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "interfaces": [catalog["interface_cid"]],
                            "interface_cids": [catalog["interface_cid"]],
                        },
                    })
                    continue
                if method == "mcp++/p2p/peers":
                    await reply({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "peers": [{
                                "id": local_peer_id,
                                "multiaddr": multiaddr,
                                "protocols": [PROTOCOL_MCP_P2P_V1],
                                "service": registry.service,
                                "tool_count": len(registry.tools),
                            }],
                            "protocol": PROTOCOL_MCP_P2P_V1,
                        },
                    })
                    continue
                if method in PROFILE_H_METHODS:
                    if not profile_h_negotiated:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {
                            "code": -32040, "message": "MCP++ Profile H was not negotiated for this session.",
                            "data": {"code": "H_CAPABILITY_NOT_NEGOTIATED"},
                        }})
                        continue
                    try:
                        result = await registry.profile_h(method, params)
                        await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
                    except ProfileHRemoteError as exc:
                        error: dict[str, Any] = {"code": exc.code, "message": str(exc)}
                        if exc.data is not None:
                            error["data"] = exc.data
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": error})
                    except Exception as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {
                            "code": -32603, "message": f"Profile H request failed: {exc}",
                        }})
                    continue
                if method in {
                    "mcp++/ucan/identity",
                    "mcp++/ucan/delegate",
                    "mcp++/ucan/validate",
                    "mcp++/ucan/revoke",
                }:
                    try:
                        forwarded = dict(params)
                        if method == "mcp++/ucan/identity":
                            forwarded.update({
                                "transport": "libp2p",
                                "peer_id": local_peer_id,
                                "multiaddr": multiaddr,
                            })
                        result = await registry.profile_c(method, forwarded)
                        await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
                    except ValueError as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": str(exc)}})
                    except Exception as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": f"Profile C request failed: {exc}"}})
                    continue
                if method.startswith("mcp++/dag/"):
                    try:
                        result = await registry.event_dag(method, params)
                        await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
                    except ValueError as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": str(exc)}})
                    except Exception as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": f"Event DAG request failed: {exc}"}})
                    continue
                if method == "mcp++/artifacts/get":
                    try:
                        result = await registry.get_artifact(str(params.get("cid") or ""))
                        await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
                    except ValueError as exc:
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": str(exc)},
                        })
                    continue
                if method == "mcp++/execute":
                    try:
                        result = await registry.execute_profile_b(params)
                        event = result.get("event") if isinstance(result, dict) else None
                        if isinstance(event, dict):
                            # The bridge derives Profile B artifacts locally. Append its
                            # event to the paired HTTP service so HTTP and libp2p expose
                            # one persisted Event DAG per MCP++ service.
                            result["event_dag"] = await registry.event_dag("mcp++/dag/append", {"event": event})
                        await reply({"jsonrpc": "2.0", "id": request_id, "result": result})
                    except ValueError as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32602, "message": str(exc)}})
                    except Exception as exc:
                        await reply({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": f"Profile B execution failed: {exc}"}})
                    continue
                if method == "tools/call":
                    tool_name = params.get("name")
                    arguments = params.get("arguments", {})
                    if not isinstance(tool_name, str) or not isinstance(arguments, dict):
                        await reply({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "tools/call requires string name and object arguments"},
                        })
                        continue
                    # Each HTTP tool execution runs independently; reply() serializes
                    # writes while preserving JSON-RPC id correlation for the caller.
                    nursery.start_soon(tool_call, request_id, tool_name, arguments)
                    continue
                await reply({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"method not found: {method}"},
                })
    finally:
        close = getattr(stream, "close", None)
        if callable(close):
            try:
                await close()
            except Exception:
                pass


async def run_bridge(args: argparse.Namespace) -> None:
    registry = HttpMcpRegistry(args.service, args.endpoint)
    await registry.refresh()

    host_result = new_host()
    host = await host_result if hasattr(host_result, "__await__") else host_result
    peer_id = str(host.get_id())

    listen = Multiaddr(f"/ip4/{args.host}/tcp/{args.port}")
    async with background_trio_service(host.get_network()):
        await host.get_network().listen(listen)
        multiaddr = f"/ip4/{args.host}/tcp/{args.port}/p2p/{peer_id}"

        async def handle(stream: Any) -> None:
            await handle_profile_e_stream(
                stream,
                registry=registry,
                local_peer_id=peer_id,
                multiaddr=multiaddr,
            )

        host.set_stream_handler(PROTOCOL_MCP_P2P_V1, handle)
        write_announce(Path(args.announce_file), {
            "service": args.service,
            "endpoint": args.endpoint,
            "protocol": PROTOCOL_MCP_P2P_V1,
            "profile_e_version": BRIDGE_PROFILE_E_VERSION,
            "canonical_initialize": True,
            "profile_a_mcp_idl": True,
            "profile_b_cid_envelope": True,
            "profile_c_ucan": True,
            "profile_h_x402_payments": registry.profile_h_profile is not None,
            "peer_id": peer_id,
            "multiaddr": multiaddr,
            "tool_count": len(registry.tools),
        })
        print(json.dumps({"service": args.service, "multiaddr": multiaddr, "tool_count": len(registry.tools)}, sort_keys=True), flush=True)
        await trio.sleep_forever()


def write_announce(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, sort_keys=True)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", required=True)
    parser.add_argument("--endpoint", required=True, help="HTTP MCP endpoint, including /mcp")
    parser.add_argument("--announce-file", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        trio.run(run_bridge, args)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
