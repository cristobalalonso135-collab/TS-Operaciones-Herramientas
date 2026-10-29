/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['exceljs', 'pptxgenjs'],
  },
};

module.exports = nextConfig;
