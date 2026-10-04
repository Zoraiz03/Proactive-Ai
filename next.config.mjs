import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** Keep production checks isolated: development uses .next; production uses .next-build. */
export default function nextConfig(phase) {
  return { distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next' : '.next-build' };
}
