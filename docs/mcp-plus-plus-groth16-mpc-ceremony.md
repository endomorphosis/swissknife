# Profile F Groth16 Multi-Party Ceremony

SwissKnife provides a local TypeScript/Node ceremony coordinator at
`scripts/zkp-mpc-ceremony.mjs`. It runs `snarkjs` locally and uses the shared
`mcp++/groth16-mpc-ceremony@1` manifest, so `ipfs_datasets_py` can independently
validate the public transcript over MCP++.

## Workflow

```bash
node scripts/zkp-mpc-ceremony.mjs init \
  --manifest artifacts/event-dag-ceremony.json \
  --ceremony-id event-dag-compaction-v1 \
  --circuit-id event_dag_compaction_v1 \
  --r1cs artifacts/event-dag.r1cs \
  --phase1-ptau artifacts/powersOfTau28_hez_final_14.ptau

node scripts/zkp-mpc-ceremony.mjs prepare-zkey \
  --manifest artifacts/event-dag-ceremony.json \
  --r1cs artifacts/event-dag.r1cs \
  --phase1-ptau artifacts/powersOfTau28_hez_final_14.ptau \
  --output-zkey artifacts/event-dag_0000.zkey

node scripts/zkp-mpc-ceremony.mjs contribute \
  --manifest artifacts/event-dag-ceremony.json \
  --participant-did did:key:z6MkhExample \
  --attestation artifacts/contributor-attestation.json \
  --input-zkey artifacts/event-dag_0000.zkey \
  --output-zkey artifacts/event-dag_0001.zkey \
  --r1cs artifacts/event-dag.r1cs \
  --phase1-ptau artifacts/powersOfTau28_hez_final_14.ptau
```

`contribute` intentionally inherits the terminal for `snarkjs`. Each
contributor enters fresh entropy locally. Never pass entropy in command-line
arguments, environment variables, prompt text, MCP tools, or artifact metadata.

At least two distinct DIDs must contribute. Finalization verifies the final
zkey again and exports a verification key:

```bash
node scripts/zkp-mpc-ceremony.mjs finalize \
  --manifest artifacts/event-dag-ceremony.json \
  --r1cs artifacts/event-dag.r1cs \
  --phase1-ptau artifacts/powersOfTau28_hez_final_14.ptau \
  --final-zkey artifacts/event-dag_0002.zkey \
  --verification-key artifacts/event-dag-vk.json
```

The common protocol and conformance fixture live in
[the MCP++ draft](api/variables/groth16.html).
`ipfs_datasets_py` can admit an externally generated Arkworks ceremony for
proof use only when a deployment enables `IPFS_DATASETS_REQUIRE_MPC_CEREMONY`
and supplies a manifest declaring `keyFormat: "arkworks-canonical"`,
`arkworks-mpc-verifier` evidence for every contribution, the exact versioned
circuit ID, and the SHA-256 of the actual local proving-key and
verification-key files. Its
bundled Arkworks setup remains single-RNG and development-only; it cannot
generate an admissible MPC artifact. The validation path is tested over HTTP
JSON-RPC and a live Profile E `/mcp+p2p/1.0.0` session to `ipfs_datasets_py`;
both return the same ceremony CID and verdict. Ceremony contribution remains
local and interactive even when validation is requested through a remote peer.
