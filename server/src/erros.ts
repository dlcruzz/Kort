// Erro com status HTTP e mensagem em português, pronta para mostrar na tela.

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: string,
  ) {
    super(message)
  }
}

export const naoEncontrado = (o = 'Registro', feminino = false) =>
  new ErroHttp(404, `${o} não ${feminino ? 'encontrada' : 'encontrado'}.`, 'nao_encontrado')
export const proibido = (msg = 'Você não tem acesso a isso.') => new ErroHttp(403, msg, 'proibido')
export const naoAutenticado = () => new ErroHttp(401, 'Entre na sua conta para continuar.', 'nao_autenticado')
export const invalido = (msg: string) => new ErroHttp(400, msg, 'invalido')
export const conflito = (msg: string) => new ErroHttp(409, msg, 'conflito')
