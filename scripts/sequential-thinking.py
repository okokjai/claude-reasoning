#!/usr/bin/env python3
"""Sequential Thinking wrapper — stdio JSON-RPC bridge to sequential-thinking MCP server.

When the MCP tool `mcp__sequential-thinking__sequentialthinking` is not injected
into the session (e.g. proxy-managed environments), use this script as a fallback.

Usage:
  python3 scripts/sequential-thinking.py --thought "Your thought" --thought-number 1 --total-thoughts 5 --next-thought-needed true
  python3 scripts/sequential-thinking.py --thought "Branch thought" --branch-id "branch-A" --branch-from 2

Output: JSON response from the MCP server (stdout).
"""
import argparse
import json
import os
import subprocess
import sys
import time

MCP_PACKAGE = "@modelcontextprotocol/server-sequential-thinking"

# On Windows, npx may be npx.cmd (batch file). subprocess.run needs the .cmd extension.
_NPX: str | None = None


def _find_npx() -> list[str]:
    """Return command prefix for launching npx."""
    if os.name == "nt":
        return ["cmd", "/c", "npx"]
    return ["npx"]


def _json_rpc(method: str, params: dict | None = None, _id: int | None = 1) -> dict:
    req = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        req["params"] = params
    if _id is not None:
        req["id"] = _id
    return req


def main():
    parser = argparse.ArgumentParser(description="Sequential Thinking MCP wrapper")
    parser.add_argument("--thought", required=True, help="Current thinking step (required)")
    parser.add_argument("--thought-number", type=int, default=1, help="Current thought number")
    parser.add_argument("--total-thoughts", type=int, default=1, help="Estimated total thoughts needed")
    parser.add_argument("--next-thought-needed", type=str, default="true", choices=["true", "false"],
                        help="Whether another thought step is needed")
    parser.add_argument("--is-revision", type=str, default=None, choices=["true", "false"],
                        help="Whether this revises previous thinking")
    parser.add_argument("--revises-thought", type=int, default=None,
                        help="Which thought is being reconsidered")
    parser.add_argument("--branch-from-thought", type=int, default=None,
                        help="Branching point thought number")
    parser.add_argument("--branch-id", default=None, help="Branch identifier")
    parser.add_argument("--needs-more-thoughts", type=str, default=None, choices=["true", "false"],
                        help="If more thoughts are needed")
    parser.add_argument("--probe", action="store_true",
                        help="Probe-only: just test if MCP server is available, no actual thought call")
    args = parser.parse_args()

    # Build the full JSON-RPC message sequence (all in one process):
    # initialize → initialized → tools/list (probe) or tools/call (actual)
    msgs = [
        _json_rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "st-wrapper", "version": "1.0"},
        }, _id=1),
        _json_rpc("notifications/initialized", {}, _id=None),
    ]

    if args.probe:
        msgs.append(_json_rpc("tools/list", _id=2))
    else:
        call_args = {
            "thought": args.thought,
            "thoughtNumber": args.thought_number,
            "totalThoughts": args.total_thoughts,
            "nextThoughtNeeded": args.next_thought_needed == "true",
        }
        if args.is_revision is not None:
            call_args["isRevision"] = args.is_revision == "true"
        if args.revises_thought is not None:
            call_args["revisesThought"] = args.revises_thought
        if args.branch_from_thought is not None:
            call_args["branchFromThought"] = args.branch_from_thought
        if args.branch_id is not None:
            call_args["branchId"] = args.branch_id
        if args.needs_more_thoughts is not None:
            call_args["needsMoreThoughts"] = args.needs_more_thoughts == "true"

        msgs.append(_json_rpc("tools/call", {
            "name": "sequentialthinking",
            "arguments": call_args,
        }, _id=3))

    # Send all messages in one process (MCP server preserves state across single stdio session)
    stdin_data = "\n".join(json.dumps(m) for m in msgs) + "\n"
    try:
        npx_cmd = _find_npx()
        # cmd /c npx -y <pkg>  — run via shell to resolve npx.cmd on Windows
        shell_cmd = " ".join(npx_cmd) + " -y " + MCP_PACKAGE
        proc = subprocess.run(
            shell_cmd, shell=True,
            input=stdin_data.encode("utf-8"),
            capture_output=True,
            text=False,
            timeout=30,
        )
    except FileNotFoundError:
        print(json.dumps({"error": "npx not found", "tool": "sequential-thinking"}), file=sys.stderr)
        sys.exit(2)
    except subprocess.TimeoutExpired:
        print(json.dumps({"error": "MCP server timed out", "tool": "sequential-thinking"}), file=sys.stderr)
        sys.exit(2)

    # Parse responses (skip initialize response, take the last result)
    # Use utf-8 with errors=replace to avoid Windows cp950 decode errors
    stdout_text = proc.stdout if isinstance(proc.stdout, str) else proc.stdout.decode("utf-8", errors="replace")
    last_result = None
    for line in stdout_text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            resp = json.loads(line)
            if "result" in resp:
                last_result = resp["result"]
            elif "error" in resp:
                print(json.dumps(resp["error"]), file=sys.stderr)
                sys.exit(2)
        except json.JSONDecodeError:
            continue

    if last_result is None:
        print(json.dumps({"error": "no valid response from MCP server"}), file=sys.stderr)
        sys.exit(2)

    if args.probe:
        result = {
            "available": True,
            "server_info": last_result.get("serverInfo", {}),
            "tools": [t.get("name") for t in last_result.get("tools", [])],
            "probe": True,
        }
        print(json.dumps(result, ensure_ascii=False))
        return

    # Extract structured content from response
    structured = last_result.get("structuredContent", {})
    output = {
        "thoughtNumber": structured.get("thoughtNumber", args.thought_number),
        "totalThoughts": structured.get("totalThoughts", args.total_thoughts),
        "nextThoughtNeeded": structured.get("nextThoughtNeeded", args.next_thought_needed == "true"),
        "branches": structured.get("branches", []),
        "thoughtHistoryLength": structured.get("thoughtHistoryLength", 0),
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()