export type GraphColumnCategory =
  | "NUMBER"
  | "BOOLEAN"
  | "DATE"
  | "TIMESTAMP"
  | "TEXT"
  | "OTHER";

export interface GraphColumn {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly category: GraphColumnCategory;
  readonly nullable: boolean;
  /** Overlay label, or "" when none was set. */
  readonly label: string;
  /** Overlay description, or "" when none was set. */
  readonly description: string;
}

export interface GraphEntity {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly kind: string;
  /** Overlay label, or "" when none was set. */
  readonly label: string;
  /** Overlay description, or "" when none was set. */
  readonly description: string;
  readonly keyColumns: readonly string[];
  readonly columns: readonly GraphColumn[];
}

export type GraphRelationshipStatus =
  | "declared"
  | "confirmed"
  | "proposed"
  | "rejected";

export interface GraphRelationship {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly origin: string;
  readonly scope: string;
  readonly status: GraphRelationshipStatus;
}

/** A configured source as reported by GET /api/graph. */
export interface GraphSource {
  readonly id: string;
  /** For example "postgresql"; "" when the document only named the source. */
  readonly databaseType: string;
  /** "ok" or "unavailable". */
  readonly status: string;
}

export interface SchemaGraph {
  readonly specVersion: string;
  /** Source ids, in document order. */
  readonly sources: readonly string[];
  /** Full source entries, in the same order as sources. */
  readonly sourceDetails: readonly GraphSource[];
  readonly entities: readonly GraphEntity[];
  readonly relationships: readonly GraphRelationship[];
}

/** Schema versions keyed by Schema to Entity source name. */
export type SchemaVersions = Readonly<Record<string, string>>;
