export function normalizePage(params?: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(params?.pageSize ?? 20) || 20),
  );
  return { page, pageSize };
}
