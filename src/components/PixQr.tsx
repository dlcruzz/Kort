import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function PixQr({ codigo, tam = 200 }: { codigo: string; tam?: number }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    QRCode.toDataURL(codigo, { width: tam * 2, margin: 1, color: { dark: '#080808', light: '#FFFFFF' } }).then(setUrl).catch(() => setUrl(''))
  }, [codigo, tam])
  return url ? <img src={url} width={tam} height={tam} alt="QR code do Pix" style={{ borderRadius: 8, border: '1px solid var(--linha)' }} /> : <div style={{ width: tam, height: tam }} />
}
