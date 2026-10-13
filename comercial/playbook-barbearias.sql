-- Playbook "Barbearias" (venda do Kort) para o ERP da Zinkra
-- Idempotente: apaga só esta coleção e recria.
delete from public.playbooks where collection = 'Barbearias';

insert into public.playbooks (collection, niche, code, title, when_to_use, body) values
('Barbearias', 'Barbearia', null, 'Como usar este playbook', 'leia antes de começar o dia',
$t$O QUE VOCÊ VENDE: o Kort, agenda online + caixa para barbearia. Oferta: 15 dias grátis, sem cartão, sem fidelidade. Depois: Solo R$ 39,90 · Barbearia R$ 79,90 · Pro R$ 149,90 (ou Grátis até 50 horários/mês). Link: https://kort-six.vercel.app

ONDE ACHAR: Google Maps "barbearia [bairro]" e Instagram (#barbearia[cidade], #barbeiro[cidade]). Prefira barbearias com 1 a 4 cadeiras e Instagram ativo: o dono decide na hora e é ele quem responde o WhatsApp.

HORÁRIO: terça a quinta, das 9h às 11h30 e das 14h às 16h. Evite sexta à tarde, sábado e depois das 18h (cadeira cheia, ninguém lê).

SEQUÊNCIA: BB1 e espere → respondeu: BB2, BB3, BB4, BB5 em balões seguidos → aceitou: BB6 → criou a conta: BB7 → dia 7: BB8 → dia 13: BB9. Sem resposta: BBF1 (2 dias), BBF2 (3 dias), BBF3 (7 dias). Recepcionista: BBA1 + BBA2. Objeções: BBP1 a BBP6. Pressa ou Instagram: BBU1.

REGRAS DE OURO:
1. Uma ideia por balão. Nunca mande textão.
2. Fale a língua dele: cadeira parada, cliente que some, WhatsApp lotado.
3. Sempre termine com uma pergunta fácil de responder com "sim".
4. O objetivo da conversa é a conta criada, não explicar tudo. Ofereça fazer junto por chamada.
5. Não prometa lembrete automático no WhatsApp: hoje o lembrete é no botão.
6. Depois que ele criar a conta, confira no painel admin do Kort e acompanhe pelo suporte.

META DO DIA: 40 aberturas → ~10 respostas → 3 contas criadas. Anote tudo no ERP para o sistema medir a taxa de cada mensagem.$t$),

('Barbearias', 'Barbearia', 'BB1', 'Abertura', '1º contato · balão único, espere resposta',
$t$Opa, tudo certo? 👊 Falo com o responsável pela [EMPRESA]?$t$),

('Barbearias', 'Barbearia', 'BB2', 'Apresentação', 'Respondeu a BB1 · balão 1 de 4, mande BB2→BB5 em sequência',
$t$Prazer! Sou o Danilo, criador do Kort 💈 É um sistema feito só para barbearia: agenda online, controle do caixa e dos clientes, tudo pelo celular.$t$),

('Barbearias', 'Barbearia', 'BB3', 'A dor do dia a dia', 'Balão 2 de 4 · logo após a BB2',
$t$Sei como é a rotina: cliente chamando no WhatsApp enquanto você está com a máquina na mão, gente que marca e não aparece, e no fim do dia ninguém sabe direito quanto entrou. Cada mensagem que você para pra responder é cadeira parada.$t$),

('Barbearias', 'Barbearia', 'BB4', 'O que muda com o Kort', 'Balão 3 de 4 · logo após a BB3',
$t$Com o Kort, a [EMPRESA] ganha um link próprio de agendamento:
✅ O cliente escolhe o serviço, o barbeiro e o horário sozinho, 24 horas, sem precisar te chamar
✅ Ele mesmo remarca ou cancela pelo link, e você recebe o aviso na hora no celular
✅ Você vê a agenda do dia, o faturamento previsto e o caixa fechado, tudo num lugar só$t$),

('Barbearias', 'Barbearia', 'BB5', 'Oferta dos 15 dias', 'Balão 4 de 4 · fecha a sequência e espera resposta',
$t$E pra você ver funcionando na prática, eu libero 15 dias grátis, com tudo liberado e sem pedir cartão. Se não gostar, é só não continuar: não tem multa nem fidelidade. Depois os planos começam em R$ 39,90 por mês, menos que o preço de um corte.

Posso te mandar o link pra você criar a agenda da [EMPRESA]? Leva uns 3 minutos.$t$),

('Barbearias', 'Barbearia', 'BB6', 'Envio do link', 'Aceitou testar',
$t$Show! 🔥 Segue o link: https://kort-six.vercel.app/criar-conta

É só criar a conta com seu WhatsApp e e-mail, colocar o nome da barbearia e os serviços com preço. No final o sistema já te dá o seu link de agendamento.

Se preferir, a gente faz junto agora numa chamada de vídeo rapidinha, em 5 minutos fica pronto. Qual você prefere?$t$),

('Barbearias', 'Barbearia', 'BB7', 'Primeiros agendamentos', 'Logo depois que ele criou a conta',
$t$Pronto, agora o pulo do gato 💈 Copia o seu link lá no topo do app e coloca na bio do Instagram e no status do WhatsApp com uma frase assim: "Agora dá pra marcar seu horário direto por aqui, sem esperar resposta 👇"

As barbearias que mais agendam são as que mandam o link pros clientes no primeiro dia. Qualquer dúvida, é só me chamar aqui ou pela aba Ajuda do app.$t$),

('Barbearias', 'Barbearia', 'BB8', 'Check-in da primeira semana', 'Dia 7 do teste',
$t$Fala, [NOME]! Já tem uma semana de Kort aí na [EMPRESA] 👊 Como está sendo? Já entrou algum agendamento pelo link?

Se tiver alguma dúvida ou algo que você queira que o sistema faça, me fala que eu resolvo rapidinho.$t$),

('Barbearias', 'Barbearia', 'BB9', 'Fim do teste', 'Dia 13 do teste · 2 dias antes de acabar',
$t$[NOME], seus 15 dias grátis acabam em 2 dias. Pra não perder a agenda, os clientes e o histórico, é só escolher o plano no app (Configurações > Plano) e pagar no Pix ou no cartão, que libera na hora:

💈 Solo, R$ 39,90/mês: barbeiro que trabalha sozinho
💈 Barbearia, R$ 79,90/mês: dono com equipe
💈 Pro, R$ 149,90/mês: casa grande ou mais de uma unidade

Quer que eu te ajude a escolher o melhor pra você?$t$),

('Barbearias', 'Barbearia', 'BBU1', 'Mensagem única (sem esperar resposta)', 'Pressa, Instagram ou lead que não respondeu a BB1',
$t$Opa, tudo certo? Sou o Danilo, criador do Kort 💈 É uma agenda online feita só para barbearia: o cliente marca, remarca e cancela sozinho por um link, 24 horas, e você controla agenda e caixa pelo celular, sem ficar respondendo WhatsApp com a máquina na mão. Estou liberando 15 dias grátis pra [EMPRESA] testar, sem cartão e sem fidelidade. Posso te mandar o link?$t$),

('Barbearias', 'Barbearia', 'BBF1', 'Follow-up sem resposta à abertura', 'Sem resposta à BB1 após 2 dias úteis · depois mande BB2→BB5',
$t$Opa, passando de novo aqui 👊 É rapidinho: tenho uma ferramenta que faz a [EMPRESA] parar de perder tempo respondendo WhatsApp pra marcar horário. Posso te mostrar?$t$),

('Barbearias', 'Barbearia', 'BBF2', 'Follow-up sem resposta à oferta', 'Sem resposta à BB5 após 3 dias úteis',
$t$Fala, [NOME]! Conseguiu ver o que te mandei sobre o Kort? Os 15 dias grátis continuam de pé pra [EMPRESA]. Se agora não for o momento, sem problema, só me avisa 🙏$t$),

('Barbearias', 'Barbearia', 'BBF3', 'Último follow-up', '7 dias sem resposta · depois, só reativação (BBR1)',
$t$Última vez que te chamo sobre isso, prometo 😅 Se um dia quiser testar a agenda online com 15 dias grátis, é só responder aqui que eu libero na hora. Sucesso aí na [EMPRESA]! 💈$t$),

('Barbearias', 'Barbearia', 'BBA1', 'Pedido de encaminhamento', 'Quem respondeu não é o dono · balão 1 de 2',
$t$Valeu pelo retorno! 🙏 Você consegue repassar a mensagem abaixo para o dono da [EMPRESA]? É coisa rápida e grátis.$t$),

('Barbearias', 'Barbearia', 'BBA2', 'Mensagem para encaminhar', 'Balão 2 de 2 · logo após a BBA1',
$t$Para o responsável pela [EMPRESA]: oi! Sou o Danilo, do Kort, uma agenda online feita para barbearia. O cliente marca sozinho pelo link, 24 horas, e você controla a agenda e o caixa pelo celular. Estou liberando 15 dias grátis, sem cartão, pra testar. Se tiver interesse, me chama no WhatsApp (11) 94116-4044.$t$),

('Barbearias', 'Barbearia', 'BBP1', 'Objeção: já uso caderno ou WhatsApp', '"Do meu jeito já funciona"',
$t$Funciona até o dia em que você está atendendo e três clientes te chamam ao mesmo tempo, né? 😅 O Kort não muda o seu jeito de trabalhar, só tira de você a parte de ficar respondendo e anotando. E como são 15 dias grátis, você testa sem risco e decide depois. Bora?$t$),

('Barbearias', 'Barbearia', 'BBP2', 'Objeção: já uso outro app', 'Usa Trinks, Booksy, AppBarber ou parecido',
$t$Boa, então você já sabe o valor de ter agenda online 👊 O Kort é simples, feito só para barbearia, sem taxa por agendamento e com suporte direto comigo pelo próprio app. Vale testar os 15 dias e comparar: se não for melhor pra você, é só não continuar.$t$),

('Barbearias', 'Barbearia', 'BBP3', 'Objeção: preço', '"Tá caro" ou "agora não tenho dinheiro"',
$t$Entendo total. Pensa assim: R$ 39,90 por mês é menos que um corte. Se o Kort trouxer um único cliente a mais ou evitar uma falta no mês, ele já se pagou.

E se você atende sozinho e o movimento ainda é pequeno, tem o plano grátis: até 50 agendamentos por mês sem pagar nada. Quer começar pelos 15 dias e ver na prática?$t$),

('Barbearias', 'Barbearia', 'BBP4', 'Objeção: meus clientes não vão usar', '"Meu cliente prefere me chamar"',
$t$Esse é o receio de todo mundo no começo 😄 Mas o link abre direto no celular, sem baixar aplicativo e sem cadastro: o cliente escolhe o horário e pronto, em 30 segundos. Quem prefere te chamar no WhatsApp continua chamando, e você mesmo lança na agenda. Os dois jeitos funcionam juntos.$t$),

('Barbearias', 'Barbearia', 'BBP5', 'Objeção: sem tempo agora', '"Depois eu vejo" ou "tô corrido"',
$t$Tranquilo, sei que a rotina é corrida. Por isso a configuração leva uns 3 minutos, e eu posso fazer junto com você numa ligação rápida, no horário que for melhor, antes de abrir ou depois de fechar. Que dia fica bom pra você?$t$),

('Barbearias', 'Barbearia', 'BBP6', 'Objeção: confiança', '"É seguro?" ou "e se eu desistir?"',
$t$Pode ficar tranquilo: os seus dados e os dos seus clientes ficam guardados com segurança e só você acessa. Não tem fidelidade nem multa. Se depois dos 15 dias não quiser continuar, é só não assinar, sem precisar falar com ninguém.$t$),

('Barbearias', 'Barbearia', 'BBR1', 'Reativação após 30 dias', 'Lead frio há mais de 30 dias',
$t$Fala, [NOME], tudo certo? Voltei aqui porque ainda tenho algumas vagas com 15 dias grátis do Kort pra barbearias de [CIDADE]. Quer que eu libere uma pra [EMPRESA]?$t$);

select code, title from public.playbooks where collection = 'Barbearias' order by code nulls first;
