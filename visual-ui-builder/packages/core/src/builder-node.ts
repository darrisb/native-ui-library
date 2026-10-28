export interface BuilderNode {
  id: string;
  type: string;
}

export function createNode(type: string): BuilderNode {
  return {
    id: crypto.randomUUID(),
    type
  };
}
