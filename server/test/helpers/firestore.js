import { randomUUID } from 'node:crypto';
// In-memory test double with atomic, serialized transactions and Firestore-like
// queries. It exercises our transaction boundaries, NOT the external service.
export function fakeFirestore() {
  const records = new Map();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const snapshot = path => ({ exists: records.has(path), id: path.split('/').at(-1), data: () => clone(records.get(path)) });
  function write(path, data, mode) {
    if (JSON.stringify(data) === undefined) throw new Error('Undefined Firestore data.');
    if (mode === 'create' && records.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
    if (mode === 'update' && !records.has(path)) throw new Error('Document does not exist.');
    records.set(path, mode === 'update' || mode === 'merge' ? { ...clone(records.get(path)), ...clone(data) } : clone(data));
  }
  function doc(path) {
    return { path, id: path.split('/').at(-1), get: async () => snapshot(path), create: async data => write(path, data, 'create'), set: async (data, options) => write(path, data, options?.merge ? 'merge' : 'set'), update: async data => write(path, data, 'update'), collection: name => collection(`${path}/${name}`) };
  }
  function collection(path, filters = [], ordering = null, max = Infinity) {
    const api = {
      doc: (id = randomUUID()) => doc(`${path}/${id}`),
      add: async data => { const ref = api.doc(); await ref.create(data); return ref; },
      where: (field, operation, value) => collection(path, [...filters, { field, operation, value }], ordering, max),
      orderBy: (field, direction = 'asc') => collection(path, filters, { field, direction }, max),
      limit: count => collection(path, filters, ordering, count),
      async get() {
        const depth = path.split('/').length + 1;
        let selected = [...records.keys()].filter(key => key.startsWith(`${path}/`) && key.split('/').length === depth).filter(key => filters.every(({ field, operation, value }) => operation === 'array-contains' ? records.get(key)[field]?.includes(value) : records.get(key)[field] === value));
        if (ordering) selected.sort((a, b) => String(records.get(a)[ordering.field]).localeCompare(String(records.get(b)[ordering.field])) * (ordering.direction === 'desc' ? -1 : 1));
        const docs = selected.slice(0, max).map(snapshot);
        return { docs, empty: !docs.length, forEach: callback => docs.forEach(callback) };
      },
      count: () => ({ get: async () => { const result = await api.get(); return { data: () => ({ count: result.docs.length }) }; } })
    };
    return api;
  }
  let queue = Promise.resolve();
  return { records, collection,
    async runTransaction(callback) {
      const work = queue.then(async () => {
        const operations = [];
        const result = await callback({ get: ref => ref.get(), create: (ref, data) => operations.push([ref.path, data, 'create']), set: (ref, data, options) => operations.push([ref.path, data, options?.merge ? 'merge' : 'set']), update: (ref, data) => operations.push([ref.path, data, 'update']) });
        for (const [path, data, mode] of operations) write(path, data, mode);
        return result;
      });
      queue = work.catch(() => {});
      return work;
    }
  };
}
