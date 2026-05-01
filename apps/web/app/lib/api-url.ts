export function getApiUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001");
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}
