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
  readonly label: string;
}

export interface GraphEntity {
  readonly id: string;
  readonly source: string;
  readonly name: string;
  readonly kind: string;
  readonly label: string;
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

export interface SchemaGraph {
  readonly specVersion: string;
  readonly sources: readonly string[];
  readonly entities: readonly GraphEntity[];
  readonly relationships: readonly GraphRelationship[];
}
