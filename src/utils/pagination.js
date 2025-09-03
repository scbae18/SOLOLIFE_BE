export function getPagination(q) {
  const page = Math.max(parseInt(q.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(q.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function getOrder(q, allowed=['created_at', 'updated_at', 'rating_avg']) {
  const [field='created_at', dir='desc'] = (q.order || '').split('.') ;
  const by = allowed.includes(field) ? field : 'created_at';
  const order = dir === 'asc' ? 'asc' : 'desc';
  return { [by]: order };
}
