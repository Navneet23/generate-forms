export interface PublishedForm {
  html: string;
  formId: string;
  createdAt: string;
}

// In-memory store — data is lost on server restart (acceptable for MVP)
const store = new Map<string, PublishedForm>();

export function save(id: string, record: PublishedForm): void {
  store.set(id, record);
}

export function get(id: string): PublishedForm | undefined {
  return store.get(id);
}
