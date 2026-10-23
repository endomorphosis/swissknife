'use strict';

/** CSS attribute quote choice is not a different native control. */
function canonicalSelector(value) {
  return String(value || '').trim().replace(/\[([A-Za-z_][-\w:]*)\s*=\s*(['"])((?:\\.|[^\\])*?)\2\s*\]/g,
    (_all, name, _quote, contents) => `[${name}=${JSON.stringify(contents.replace(/\\(['"\\])/g, '$1'))}]`);
}
function controlKey(row) {
  return JSON.stringify([row.app_id || '', row.launch_id || row.app_id || '', canonicalSelector(row.resolved_from || row.selector)]);
}
module.exports = { canonicalSelector, controlKey };
