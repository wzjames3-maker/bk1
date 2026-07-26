import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
}

export default withSentryConfig(nextConfig, {
  org: 'wzjames',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
})
