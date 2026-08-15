/**
 * GuiStaticFixtureSuite@1 — opaque third-party widget.
 *
 * Dynamic HTML insertion, remote script loading, and an unknown custom
 * element cannot be reduced by GuiStaticScanner@1. Context packing must
 * include this source as raw even when a capsule is offered.
 */

export type OpaqueWidgetProps = {
  html: string;
  actionId?: string;
};

export function OpaqueThirdPartyWidget(props: OpaqueWidgetProps): HTMLElement {
  const host = document.createElement('section');
  host.setAttribute('data-testid', 'opaque-third-party-widget');
  host.setAttribute('data-action', props.actionId ?? 'opaque-dispatch');
  host.innerHTML = props.html;
  return host;
}

export function mountOpaqueWidget(root: HTMLElement, html: string): void {
  root.innerHTML = html;
  const script = document.createElement('script');
  script.src = 'https://cdn.example/opaque-widget.js';
  root.appendChild(script);
}

export function defineOpaqueCustomElement(): void {
  customElements.define(
    'opaque-third-party-widget',
    class extends HTMLElement {
      connectedCallback(): void {
        this.innerHTML = this.getAttribute('data-html') ?? '';
      }
    },
  );
}

export class OpaqueHost {
  render(): string {
    return `
      <section data-testid="opaque-host" data-state="ready">
        <button type="button" data-action="opaque-dispatch">Dispatch</button>
        <form data-testid="opaque-form">
          <input name="payload" required />
          <button type="submit" data-action="opaque-submit">Submit</button>
        </form>
      </section>
    `;
  }
}
