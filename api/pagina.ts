// Prévia do link da barbearia (WhatsApp, Instagram, Facebook...).
//
// Esses apps não rodam o React: leem só as etiquetas <meta> do HTML.
// Para /b/<slug>, esta função busca os dados da barbearia e entrega o
// mesmo index.html com nome, descrição e logo dela. Para o cliente nada
// muda: o React carrega igual por cima.
//
// Se o banco demorar ou falhar, devolve o index.html normal.

export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://zlrdnwkihldhimlpneni.supabase.co'
// chave "anon public" (a mesma do front; quem protege os dados é o RLS)
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpscmRud2tpaGxkaGltbHBuZW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDY0NTYsImV4cCI6MjEwNzQ4MjQ1Nn0.GAdm6eGrY-2v5ZU9qQLqWpI0v1YuUaHydLxDFaceNzA'

type Barbearia = {
  nome: string
  descricao: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  logo_url: string | null
  capa_url?: string | null
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('slug') ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  const origem = `${url.protocol}//${url.host}`

  const html = await fetch(`${origem}/index.html`).then((r) => r.text())
  const b = slug ? await buscar(slug) : null
  if (!b) return responder(html, 60)

  return responder(html.replace('</head>', `${etiquetas(b, `${origem}/b/${slug}`, origem)}\n  </head>`), 300)
}

async function buscar(slug: string): Promise<Barbearia | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pagina_publica`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { barbearia?: Barbearia } | null
    return d?.barbearia ?? null
  } catch {
    return null
  }
}

export function etiquetas(b: Barbearia, link: string, origem: string) {
  const lugar = [b.bairro?.trim(), b.cidade?.trim() && `${b.cidade.trim()}${b.uf ? `/${b.uf}` : ''}`].filter(Boolean).join(', ')
  const titulo = b.nome.trim()
  const descricao = (b.descricao?.trim() || `Escolha o serviço, o barbeiro e o horário${lugar ? ` na ${b.nome.trim()}, ${lugar}` : ''}. Sem precisar mandar mensagem.`).slice(0, 190)
  const imagem = b.logo_url || b.capa_url || `${origem}/logo.png`
  const e = escapar
  return [
    `<title>${e(titulo)}</title>`,
    `<meta name="description" content="${e(descricao)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(b.nome.trim())}" />`,
    `<meta property="og:title" content="${e(titulo)}" />`,
    `<meta property="og:description" content="${e(descricao)}" />`,
    `<meta property="og:url" content="${e(link)}" />`,
    `<meta property="og:image" content="${e(imagem)}" />`,
    `<meta property="og:image:alt" content="${e(`Logo da ${b.nome.trim()}`)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].map((t) => `    ${t}`).join('\n')
}

function responder(html: string, segundos: number) {
  // o <title> fixo do index.html sai quando a barbearia manda o dela
  const final = html.includes('og:title') ? html.replace(/<title>Kort: agenda e gestão para barbearias<\/title>\s*/, '') : html
  return new Response(final, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${segundos}, stale-while-revalidate=86400`,
    },
  })
}

function escapar(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
