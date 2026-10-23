/** A DOM inventory uses selectors that survive another launch of the app. */
export function collectRenderedControls(root) {
  const quoted = value => String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  const structural = element => {
    const parts = [];
    let current = element;
    while (current && current !== root) {
      const siblings = [...current.parentElement.children].filter(item => item.tagName === current.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    return current === root ? `:scope > ${parts.join(' > ')}` : '';
  };
  return [...root.querySelectorAll('button, [role="button"], [role="menuitem"], a[href], input, select, textarea, [data-live-gateway-binding], [data-native-gateway-binding], .window-control')].map(element => {
    const binding = element.getAttribute('data-live-gateway-binding') || '';
    const nativeBinding = element.getAttribute('data-native-gateway-binding') || '';
    const exactTool = element.getAttribute('data-native-tool-id') || element.getAttribute('data-native-gateway-tool') || element.getAttribute('data-gateway-exact-tool') || '';
    const action = element.getAttribute('data-action') || '';
    let selector = '';
    const chrome = ['minimize', 'maximize', 'close'].find(kind => element.classList.contains('window-control') && element.classList.contains(kind));
    if (chrome) selector = `.window-control.${chrome}`;
    else if (binding) {
      selector = `[data-live-gateway-binding="${quoted(binding)}"]`;
      if (exactTool) selector += `[data-gateway-exact-tool="${quoted(exactTool)}"]`;
    } else if (nativeBinding) {
      selector = `[data-native-gateway-binding="${quoted(nativeBinding)}"]`;
      const toolAttribute = element.hasAttribute('data-native-tool-id') ? 'data-native-tool-id' : 'data-native-gateway-tool';
      if (exactTool) selector += `[${toolAttribute}="${quoted(exactTool)}"]`;
    } else if (element.hasAttribute('data-gateway-policy-tool')) selector = `[data-gateway-policy-tool="${quoted(element.getAttribute('data-gateway-policy-tool'))}"]`;
    else if (element.hasAttribute('data-openrouter-action')) selector = ['model', 'provider', 'placement', 'action']
      .map(name => `[data-openrouter-${name}="${quoted(element.getAttribute(`data-openrouter-${name}`))}"]`).join('');
    else if (element.id && !/\d{8,}/.test(element.id)) selector = `#${CSS.escape(element.id)}`;
    else if (action && !/\$\{|escapeHTML/.test(action)) selector = `[data-action="${quoted(action)}"]`;
    else {
      const attribute = element.hasAttribute('aria-label') ? 'aria-label' : 'title';
      const label = element.getAttribute(attribute) || '';
      if (label && !/\$\{|escapeHTML/.test(label)) selector = `${element.tagName.toLowerCase()}[${attribute}="${quoted(label)}"]`;
    }
    // Repeated labels/actions are distinct controls. A current DOM path is
    // preferable to silently dropping one or selecting the first twice.
    try { if (!selector || root.querySelectorAll(selector).length !== 1) selector = structural(element); }
    catch { selector = structural(element); }
    return {
      selector,
      role: element.getAttribute('role') || (element.classList.contains('window-control') ? 'button' : element.tagName.toLowerCase()),
      accessible_name: (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().slice(0, 160),
      visible: element.getClientRects().length > 0,
      data_action: action,
      data_live_gateway_binding: binding,
      data_native_gateway_binding: nativeBinding,
      data_native_gateway_tool: exactTool,
      data_gateway_policy_tool: element.getAttribute('data-gateway-policy-tool') || '',
      data_external_provider: element.getAttribute('data-external-provider') || '',
    };
  });
}
