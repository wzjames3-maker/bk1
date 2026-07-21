import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
}

export default nextConfig
