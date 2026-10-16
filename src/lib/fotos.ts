// Fotos no Supabase Storage.
//
// Buckets públicos (qualquer um vê; só a equipe envia, ver
// supabase/minha-barbearia.sql). Todo arquivo fica em <barbearia_id>/...
// porque é por essa pasta que o banco confere quem pode enviar.
//
// Antes de enviar, a foto é reduzida no próprio celular (lado maior de
// até 1600 px, em WebP). Foto de 5 MB vira uns 200 KB e o plano grátis
// do Supabase rende muito mais.

import { supabase } from './supabase'
import { uid } from './format'

export type Bucket = 'barbearias' | 'membros' | 'portfolio' | 'produtos'

const LIMITE_ORIGINAL = 15 * 1024 * 1024 // foto maior que isso nem tenta
const LIMITE_FINAL = 2 * 1024 * 1024     // igual ao limite do bucket

export const fotosLigadas = () => !!supabase

/** Reduz e converte para WebP (JPEG se o navegador não souber WebP). */
export async function comprimirImagem(arquivo: File, ladoMaximo = 1600, qualidade = 0.82): Promise<Blob> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  if (arquivo.size > LIMITE_ORIGINAL) throw new Error('Essa foto é grande demais. Tente outra.')

  const img = await carregar(arquivo)
  const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height))
  const w = Math.round(img.width * escala)
  const h = Math.round(img.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não deu para preparar a foto.')
  ctx.drawImage(img, 0, 0, w, h)
  if ('close' in img) img.close()

  let blob = await paraBlob(canvas, 'image/webp', qualidade)
  if (!blob || blob.type !== 'image/webp') blob = await paraBlob(canvas, 'image/jpeg', qualidade)
  if (!blob) throw new Error('Não deu para preparar a foto.')
  if (blob.size > LIMITE_FINAL) blob = (await paraBlob(canvas, blob.type, 0.6)) ?? blob
  if (blob.size > LIMITE_FINAL) throw new Error('A foto ficou grande demais mesmo reduzida. Tente outra.')
  return blob
}

async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap já respeita a rotação das fotos de celular
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    } catch {
      /* cai no jeito antigo (ex.: HEIC em navegador sem suporte) */
    }
  }
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); ok(img) }
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não deu para abrir essa foto. Use JPG ou PNG.')) }
    img.src = url
  })
}

const paraBlob = (c: HTMLCanvasElement, tipo: string, q: number) =>
  new Promise<Blob | null>((ok) => c.toBlob(ok, tipo, q))

/**
 * Reduz e envia a foto. Devolve o endereço público (vai direto no <img src>).
 * `nome` sem extensão; cada envio ganha um nome novo para o navegador não
 * mostrar a foto antiga guardada em cache.
 */
export async function enviarFoto(bucket: Bucket, barbeariaId: string, nome: string, arquivo: File, ladoMaximo?: number): Promise<string> {
  if (!supabase) throw new Error('Fotos só funcionam com a conta real (não na demonstração).')
  const blob = await comprimirImagem(arquivo, ladoMaximo)
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${barbeariaId}/${nome}-${uid().slice(0, 8)}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(caminho, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw new Error(traduzir(error.message))
  return supabase.storage.from(bucket).getPublicUrl(caminho).data.publicUrl
}

/** Apaga pelo endereço público. Falha em silêncio: foto órfã não quebra nada. */
export async function apagarFoto(url: string | null | undefined) {
  if (!supabase || !url) return
  const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return
  await supabase.storage.from(m[1]).remove([decodeURIComponent(m[2])])
}

function traduzir(msg: string) {
  if (/row-level security|unauthorized|403/i.test(msg)) return 'Você não tem permissão para trocar essa foto.'
  if (/size|too large|413/i.test(msg)) return 'A foto passou de 2 MB.'
  if (/mime|type/i.test(msg)) return 'Use foto JPG, PNG ou WebP.'
  return 'Não deu para enviar a foto. Confira a internet e tente de novo.'
}
