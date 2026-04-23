/**
 * Enrichment provider abstraction.
 *
 * The pipeline's job is simple: given whatever the user typed about a
 * recipient (email / name+org / LinkedIn URL), return the best available
 * profile {name, title, organization, one_liner}.
 *
 * Every concrete provider implements this interface. The dispatcher layer
 * (index.ts) picks which provider(s) to call based on which fields are set
 * on the query and which API keys are configured.
 */

export interface EnrichmentQuery {
  email?: string;
  name?: string;
  organization?: string;
  linkedinUrl?: string;
}

export interface EnrichmentResult {
  name?: string;
  title?: string;
  organization?: string;
  oneLiner?: string;
  /** Raw vendor payload — persisted for auditing; never surfaced raw to the client. */
  raw?: unknown;
  /** Short string identifying which concrete provider produced the result. */
  source: string;
  confidence: number; // 0..1
}

export interface EnrichmentProvider {
  readonly id: string;
  /** Returns true if this provider can potentially handle the query. */
  canHandle(q: EnrichmentQuery): boolean;
  enrich(q: EnrichmentQuery): Promise<EnrichmentResult | null>;
}
