'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X } from 'lucide-react'

export function BarcodeScannerOverlay({
  onDetected,
  onClose,
}: {
  onDetected: (isbn: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoRef.current) return
    const reader = new BrowserMultiFormatReader()
    let controlsRef: { stop: () => void } | null = null
    let active = true

    reader
      .decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, _err, controls) => {
          if (result && active) {
            active = false
            controls.stop()
            onDetected(result.getText())
          }
        },
      )
      .then((controls) => {
        controlsRef = controls
      })
      .catch(() => {
        if (active) {
          setError(
            'Camera access denied. Please allow camera access in your browser settings.',
          )
        }
      })

    return () => {
      active = false
      controlsRef?.stop()
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {error ? (
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-center text-sm text-white">{error}</p>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <p className="text-sm text-white/80">Point camera at barcode</p>
            <div className="h-60 w-60 rounded-lg border-2 border-white" />
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
        aria-label="Close scanner"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
