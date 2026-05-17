/**
 * @moikapy/origen/peers — Peer and session providers for the representation system.
 *
 * Re-exports LocalPeerProvider (filesystem) and CloudPeerProvider (D1).
 *
 * **Tree-shaking**: Import from specific sub-paths for edge compatibility:
 *   - `@moikapy/origen/peers/cloud` — CloudPeerProvider only (edge-safe)
 *   - `@moikapy/origen/peers/local`  — LocalPeerProvider only (Node.js)
 *
 * @module peers
 */

export { LocalPeerProvider } from "./peers-local";
// CloudPeerProvider will be added in a future task
// export { CloudPeerProvider, PEERS_MIGRATION } from "./peers-cloud";
export type { Peer, Session, PeerProvider, PeersConfig, RepresentationMeta } from "./types";