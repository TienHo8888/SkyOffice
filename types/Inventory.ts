/** A compact stack used by both the REST social snapshot and realtime receipts. */
export interface InventoryStack {
  itemId: string
  quantity: number
}

export interface DbInventoryItem {
  userId: string
  itemId: string
  quantity: number
  updatedAt: string
}

export interface DbInventoryTransaction {
  id: string
  userId: string
  idempotencyKey: string
  itemId: string
  delta: number
  metadataJson: string
  createdAt: string
  receiptJson?: string
}
