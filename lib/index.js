/**
 * Host half of dsh-token-speed.
 *
 * This plugin is browser-only: every moving part (the ring gauge, the live
 * speed sampling, the detail panel) lives in ./client.js, which the web app
 * loads because of the `dsh.client` declaration. The host half exists so the
 * bundle patch's `insert` row resolves to a real Cordis plugin: it declares
 * the plugin's identity and mounts nothing, which keeps the plugin
 * uninstallable/disableable through the ordinary loader without leaving any
 * server-side state behind.
 *
 * @module dsh-token-speed
 */

/** Cordis plugin identity (the `inject` list stays empty: no host service is needed). */
export const name = 'dsh-token-speed'

/** No host service is required by the browser half. */
export const inject = []

/**
 * Host-side body: intentionally empty.
 * @param ctx - the host Cordis context.
 */
export function apply(ctx) {
  ctx.logger?.debug?.('dsh-token-speed: host half mounted (no server-side services)')
}
