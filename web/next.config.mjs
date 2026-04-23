/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native / native-adjacent node modules must not be bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: [
      "@node-rs/argon2",
      "@prisma/client",
      "prisma",
      "bullmq",
      "ioredis",
      "nodemailer",
      "mailparser",
    ],
  },
};

export default nextConfig;
