/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.API_BASE_URL;
    if (!apiBase) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "API_BASE_URL must be set in production so /api/* can be proxied to the Hono API",
        );
      }
      return [
        { source: "/api/:path*", destination: "http://localhost:3001/api/:path*" },
      ];
    }
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
