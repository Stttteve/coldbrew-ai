import { gmailProvider } from "./gmail";
import type { MailProvider, ProviderKind } from "./types";

const registry: Record<ProviderKind, MailProvider> = {
  google: gmailProvider,
  // Populated in v1.5 / v2:
  microsoft: undefined as unknown as MailProvider,
  nylas: undefined as unknown as MailProvider,
};

export function getProvider(kind: ProviderKind): MailProvider {
  const p = registry[kind];
  if (!p) throw new Error(`Provider not implemented yet: ${kind}`);
  return p;
}

export type { MailProvider, ProviderKind } from "./types";
