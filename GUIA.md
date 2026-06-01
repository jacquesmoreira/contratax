# Guia do Licita — o que faz e por que vale

Visão geral do produto, em linguagem de benefício. Use como referência interna e
como base para a comunicação com o cliente.

## Em uma frase

O Licita encontra todas as licitações públicas do Brasil que combinam com a empresa
do cliente, lê cada edital por ele e diz se ele está apto a participar — antes de
ele gastar horas montando papelada.

## A jornada do cliente (passo a passo)

1. **Descobre na vitrine.** Na página inicial, o cliente faz uma busca grátis: escolhe
   o estado e o ramo, e vê na hora quantas licitações estão abertas para ele e o valor
   total em jogo. Sem cadastro.
2. **Cria o painel em 30 segundos.** Informa nome, e-mail, estado e ramo. Recebe um
   link exclusivo com o painel já cheio dos editais do ramo dele. Começa em teste grátis.
3. **Acompanha no painel.** Vê os editais ordenados por prazo, com os mais urgentes no
   topo, valor e selo de novidade.
4. **Analisa um edital.** Com um clique, recebe o resumo do edital, as exigências de
   habilitação, os alertas (as armadilhas) e o veredito: apto ou não apto, item a item.
5. **Recebe todo dia.** Um e-mail diário traz as licitações novas do ramo dele.
6. **Assina.** Ao fim do teste, paga via Pix para continuar.

## O que o Licita faz (funcionalidades e benefícios)

| Funcionalidade | O benefício para o cliente |
|---|---|
| **Busca nacional do ramo** | Para de garimpar portal por portal. Tudo num lugar só. |
| **Painel atualizado todo dia** | Nunca mais perde um edital por não ter visto a tempo. |
| **Resumo do edital** | Entende em 30 segundos o que levaria meia hora de leitura. |
| **Alertas (armadilhas)** | Vê visita técnica obrigatória, garantia, prazo curto e atestado raro antes de se inscrever. |
| **Conferência de aptidão** | Sabe na hora se está habilitado e o que falta — não monta papelada para edital que não ganharia. |
| **E-mail diário** | O hábito que mantém o cliente sempre à frente, sem precisar lembrar de entrar. |
| **Prazos destacados** | Foca a energia no que encerra primeiro. |

## O diferencial que já temos

A maioria das ferramentas só **acha** o edital. O Licita também **lê** e **confere a
aptidão** cruzando as exigências do edital com a documentação da empresa. Esse é o
nosso diferencial pronto — poucos concorrentes entregam isso.

## O que ainda não existe (roadmap, para ser honesto)

Estes são os "pontos de ouro" que vão nos separar da concorrência, ainda **não
construídos** (próximo capítulo, após validar o produto):

- **Termômetro de preço** — por quanto os concorrentes ganharam licitações iguais.
- **Radar pré-edital** — saber que um contrato vai vencer e a licitação vem aí, com meses de antecedência.
- **Alerta de cotação / vitrine institucional** — entrar antes do edital, apresentando o produto ao órgão.
- **Parcerias para grandes contratos** — ganhar o que sozinho não se ganharia.

## Como você opera (admin)

- `npm run clientes` — lista clientes e status da assinatura.
- `node scripts/ativar.mjs <token>` — ativa um cliente após o Pix.
- `node scripts/remover.mjs <token>` — cancela/remove um cliente.
- `/painel?c=admin` — vê os editais de todos os clientes.
- A atualização do acervo e os e-mails rodam sozinhos todo dia.

## Por que o cliente paga R$ 197/mês

Uma única licitação ganha vale dezenas a centenas de milhares de reais. O Licita custa
menos que uma hora de um consultor de licitações, e trabalha todo dia, sozinho, para
o cliente. O retorno de um contrato fechado paga anos de assinatura.
