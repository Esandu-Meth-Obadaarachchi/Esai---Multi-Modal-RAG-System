/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "@pinecone-database/pinecone"],
  },
};

module.exports = nextConfig;
