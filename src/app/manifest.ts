import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chiara Store POS',
    short_name: 'ChiaraPOS',
    description: 'Point of Sale System for Chiara Store',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f0ee',
    theme_color: '#b08a8a',
    orientation: 'any',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
