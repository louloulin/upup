/**
 * Example Skill Plugin — Reference implementation.
 *
 * This file is intentionally tiny. The skills declared in
 * `upup.plugin.json` are auto-registered by the host loader
 * (see src/plugins/loader.ts: loadPlugin() calls
 * registerSkill() for each entry in manifest.skills).
 *
 * If you need to register skills dynamically (e.g. based on
 * config or runtime state), use the `api.registerSkill()`
 * runtime API here:
 *
 *   export default function activate(api) {
 *     api.registerSkill({
 *       name: 'my-dynamic-skill',
 *       description: 'Registered at runtime',
 *       instructions: '...',
 *     });
 *   }
 *
 * In the simple case (static manifest), exporting an empty
 * default is enough.
 */
export default function activate(api) {
  // The manifest-declared skills are already registered by
  // the host before this function runs. Use this hook to
  // log or perform other activation side effects.
  api.logger?.info?.('example-skill-plugin activated');
}
