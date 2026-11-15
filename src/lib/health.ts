/**
 * Tiny registry of optional component states for the health endpoint, so the
 * HTTP layer doesn't need to import those components.
 */
export type ComponentState = 'disabled' | 'starting' | 'running' | 'error' | 'stopped';

const components = new Map<string, ComponentState>();

export function setComponentState(name: string, state: ComponentState): void {
  components.set(name, state);
}

export function getComponentStates(): Record<string, ComponentState> {
  return Object.fromEntries(components);
}
