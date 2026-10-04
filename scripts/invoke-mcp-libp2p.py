#!/usr/bin/env python3
"""Invoke one MCP tool through a live MCP++ Profile E libp2p peer.

This is intentionally a small, one-request server-side connector for the
desktop mediator.  py-libp2p is the interoperable implementation for the
locally announced Profile E bridges; keeping it outside the browser preserves
the desktop's same-origin boundary while ensuring the selected operation was
actually sent over the announced libp2p stream.
"""

from __future__ import annotations

import argparse
from contextlib import asynccontextmanager
import inspect
import json
import sys
from typing import Any

# The ipfs_accelerate_py import graph configures a few informational logging
# handlers while it loads.  Its stdout is a protocol channel when this helper
# is launched by the Vite mediator, so make those handlers bind stderr before
# importing the libp2p client.  Restore stdout immediately afterwards: the
# only stdout emitted by this program must be the final JSON response.
_protocol_stdout = sys.stdout
sys.stdout = sys.stderr
import trio
from libp2p import new_host
from libp2p.peer.peerinfo import info_from_p2p_addr
from libp2p.tools.async_service import background_trio_service
from multiaddr import Multiaddr
sys.stdout = _protocol_stdout

MCP_PROTOCOL_VERSION = "2024-11-05"
MCP_P2P_PROTOCOL = "/mcp+p2p/1.0.0"
MAX_FRAME_BYTES = 16 * 1024 * 1024


@asynccontextmanager
async def libp2p_client_host():
    """Run the minimal Profile E client host without importing server stacks."""
    host = new_host()
    if inspect.isawaitable(host):
        host = await host
    try:
        async with background_trio_service(host.get_network()):
            # Noise handshakes are bidirectional. A listening ephemeral port
            # is therefore required even though this process only originates
            # the MCP++ stream.
            await host.get_network().listen(Multiaddr("/ip4/127.0.0.1/tcp/0"))
            yield host
    finally:
        try:
            await host.close()
        except Exception:
            pass


async def open_profile_e_stream(host: Any, multiaddr: str) -> Any:
    peer = info_from_p2p_addr(Multiaddr(multiaddr))
    await host.connect(peer)
    return await host.new_stream(peer.peer_id, [MCP_P2P_PROTOCOL])


async def read_exact(stream: Any, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = await stream.read(min(remaining, 4096))
        if not chunk:
            raise EOFError("unexpected end of Profile E stream")
        chunks.append(bytes(chunk))
        remaining -= len(chunk)
    return b"".join(chunks)


class ProfileEJsonRpcClient:
    """Small, dependency-local JSON-RPC client for the u32 MCP++ stream."""

    def __init__(self, stream: Any) -> None:
        self.stream = stream
        self.next_id = 1

    async def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = self.next_id
        self.next_id += 1
        payload = json.dumps({
            "jsonrpc": "2.0", "id": request_id, "method": method,
            "params": params,
        }, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if len(payload) > MAX_FRAME_BYTES:
            raise ValueError("MCP++ request exceeds the Profile E frame limit")
        await self.stream.write(len(payload).to_bytes(4, "big") + payload)
        frame_size = int.from_bytes(await read_exact(self.stream, 4), "big")
        if frame_size > MAX_FRAME_BYTES:
            raise ValueError("MCP++ response exceeds the Profile E frame limit")
        response = json.loads((await read_exact(self.stream, frame_size)).decode("utf-8"))
        if not isinstance(response, dict) or response.get("id") != request_id:
            raise ValueError("Profile E response did not match the request ID")
        if isinstance(response.get("error"), dict):
            raise ValueError(str(response["error"].get("message") or "Profile E peer rejected the request"))
        return response

    async def close(self) -> None:
        close = getattr(self.stream, "close", None)
        if callable(close):
            await close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--multiaddr", required=True)
    parser.add_argument("--tool-id", required=True)
    parser.add_argument("--arguments-json", required=True)
    parser.add_argument("--audience-did", required=True)
    parser.add_argument("--nonce", required=True)
    return parser.parse_args()


async def invoke(args: argparse.Namespace) -> dict[str, Any]:
    arguments = json.loads(args.arguments_json)
    if not isinstance(arguments, dict):
        raise ValueError("tool arguments must be a JSON object")

    # Avoid importing the accelerator server package for each desktop click:
    # this invocation only needs libp2p plus the public MCP++ framing.  The
    # actual tool still runs on the announced remote owner peer.
    async with libp2p_client_host() as host:
        client = ProfileEJsonRpcClient(await open_profile_e_stream(host, args.multiaddr))
        try:
            initialized = await client.request("initialize", {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {"experimental": {
                    "mcp++/mcp-idl": True,
                    "mcp++/cid-envelope": True,
                    "mcp++/ucan": True,
                    "mcp++/event-dag": True,
                    "mcp++/p2p-transport": True,
                }},
                "clientInfo": {"name": "swissknife-desktop-mediator", "version": "1.0.0"},
            })
            interfaces = await client.request("interfaces/list", {})
            interface_cids = (interfaces.get("result") or {}).get("interface_cids")
            if not isinstance(interface_cids, list) or not isinstance(interface_cids[0] if interface_cids else None, str):
                raise ValueError("Profile E peer did not return a Profile A descriptor CID")
            identity_response = await client.request("mcp++/ucan/identity", {
                "audience": args.audience_did,
                "nonce": args.nonce,
                "transport": "libp2p",
            })
            identity = identity_response.get("result")
            # Return the complete Profile C response only to the server-side
            # mediator.  It verifies the signed UCAN against this request's
            # audience, nonce, service, and transport before reducing it to a
            # browser-safe DID/proof-CID observation.  In particular, do not
            # treat the peer merely echoing a DID and CID as verification.
            if not isinstance(identity, dict) or not isinstance(identity.get("ucan"), str):
                raise ValueError("Profile E peer did not return a Profile C identity UCAN")
            call = await client.request("tools/call", {
                "name": args.tool_id,
                "arguments": arguments,
            })
            return {
                "result": call.get("result"),
                "profile_a_descriptor_cid": interface_cids[0],
                "profile_c_identity": identity,
            }
        finally:
            await client.close()


def main() -> None:
    try:
        value = trio.run(invoke, parse_args())
        print(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
    except Exception as error:
        print(f"MCP++ libp2p desktop invocation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
