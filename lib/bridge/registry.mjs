import registry from "./registry.json" with { type: "json" };

/** @typedef {keyof typeof registry.actions} BridgeActionId */

export { registry };

/** @returns {BridgeActionId[]} */
export function bridgeActionIds() {
  return /** @type {BridgeActionId[]} */ (Object.keys(registry.actions));
}

/** @param {string} actionId */
export function getBridgeAction(actionId) {
  const action = registry.actions[actionId];
  if (!action) {
    throw new Error(`unknown bridge action: ${actionId}`);
  }
  return action;
}

/** Template keys that must exist in prompt_templates.TEMPLATES */
export function templateKeysInRegistry() {
  const keys = new Set();
  for (const action of Object.values(registry.actions)) {
    if (action.template_key) keys.add(action.template_key);
  }
  return [...keys];
}
