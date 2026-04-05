'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

interface BarcodeScannerProps {
  onScan: (result: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState('')
  const [detected, setDetected] = useState(false)
  const [useNative, setUseNative] = useState(false)

  const stopAll = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (readerRef.current) {
        try { readerRef.current = null } catch {}
    }
  }, [])

  // Native BarcodeDetector loop
  const startNative = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return
    videoRef.current.srcObject = stream
    await videoRef.current.play()

    // @ts-expect-error BarcodeDetector not in TS types yet
    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf', 'codabar'],
    })

    const scan = async () => {
      if (!videoRef.current || detected) return
      try {
        const barcodes = await detector.detect(videoRef.current)
        if (barcodes.length > 0) {
          setDetected(true)
          stopAll()
          onScan(barcodes[0].rawValue)
          return
        }
      } catch {}
      animFrameRef.current = requestAnimationFrame(scan)
    }

    animFrameRef.current = requestAnimationFrame(scan)
  }, [detected, onScan, stopAll])

  // ZXing fallback
  const startZXing = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    try {
      await reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (result && !detected) {
          setDetected(true)
          stopAll()
          onScan(result.getText())
        }
      })
    } catch (err) {}
  }, [detected, onScan, stopAll])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        // Check native support
        if ('BarcodeDetector' in window) {
          setUseNative(true)
          await startNative(stream)
        } else {
          await startZXing(stream)
        }
      } catch (e) {
        setError('❌ Camera error. Please allow camera access.')
        console.error(e)
      }
    }

    start()

    return () => {
      cancelled = true
      stopAll()
    }
  }, [startNative, startZXing, stopAll])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '400px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ color: 'white', fontSize: '14px', fontWeight: 600, margin: 0 }}>
          📷 Scan Barcode
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', backgroundColor: useNative ? '#7aaa7a33' : '#c4aa7a33', color: useNative ? '#7aaa7a' : '#c4aa7a', fontWeight: 600 }}>
            {useNative ? '⚡ Native' : '🔄 ZXing'}
          </span>
          <button onClick={() => { stopAll(); onClose() }}
            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', backgroundColor: 'rgba(255,255,255,0.15)', color: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
            Close
          </button>
        </div>
      </div>

      {/* Video */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '400px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', display: 'block', borderRadius: '16px' }}
        />

        {/* Scanning overlay */}
        {!detected && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {/* Corner brackets */}
            <div style={{ position: 'relative', width: '220px', height: '120px' }}>
              {/* Top-left */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: '24px', height: '24px', borderTop: '3px solid #c4a09a', borderLeft: '3px solid #c4a09a', borderRadius: '4px 0 0 0' }} />
              {/* Top-right */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: '24px', height: '24px', borderTop: '3px solid #c4a09a', borderRight: '3px solid #c4a09a', borderRadius: '0 4px 0 0' }} />
              {/* Bottom-left */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '24px', height: '24px', borderBottom: '3px solid #c4a09a', borderLeft: '3px solid #c4a09a', borderRadius: '0 0 0 4px' }} />
              {/* Bottom-right */}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '24px', height: '24px', borderBottom: '3px solid #c4a09a', borderRight: '3px solid #c4a09a', borderRadius: '0 0 4px 0' }} />
              {/* Scanning line */}
              <div style={{
                position: 'absolute', left: '4px', right: '4px', height: '2px',
                backgroundColor: '#c4a09a', opacity: 0.8,
                animation: 'scanline 1.5s ease-in-out infinite',
                top: '50%',
              }} />
            </div>
          </div>
        )}

        {/* Success overlay */}
        {detected && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(122,170,122,0.3)', borderRadius: '16px' }}>
            <p style={{ color: 'white', fontSize: '32px' }}>✅</p>
          </div>
        )}
      </div>

      {/* Hint */}
      {!error && !detected && (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
          Point camera at barcode — auto detects!
        </p>
      )}

      {error && (
        <p style={{ color: '#c47a7a', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Scan line animation */}
      <style>{`
        @keyframes scanline {
          0%, 100% { transform: translateY(-30px); opacity: 0.4; }
          50% { transform: translateY(30px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}