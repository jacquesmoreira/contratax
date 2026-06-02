// Gerador das declaracoes de habilitacao padrao (Lei 14.133/2021). Preenche com os
// dados da empresa; campos que faltam viram [PLACEHOLDER] para o cliente completar.
// Sem custo de IA: sao modelos juridicos padronizados.

const campo = (v, ph) => (v && String(v).trim() ? String(v).trim() : `[${ph}]`);

export function gerarDeclaracoes(dados = {}) {
  const rz = campo(dados.razaoSocial || dados.nome, "RAZAO SOCIAL");
  const cnpj = campo(dados.cnpj, "CNPJ");
  const end = campo(dados.endereco, "ENDERECO COMPLETO");
  const rep = dados.representante || {};
  const repNome = campo(rep.nome, "NOME DO REPRESENTANTE LEGAL");
  const repCpf = campo(rep.cpf, "CPF DO REPRESENTANTE");
  const repCargo = campo(rep.cargo, "CARGO");

  const cab = `${rz}, inscrita no CNPJ sob o nº ${cnpj}, com sede em ${end}, por meio de seu representante legal ${repNome}, ${repCargo}, inscrito(a) no CPF nº ${repCpf}`;
  const rodape = `\n\n[CIDADE], [DIA] de [MÊS] de [ANO].\n\n______________________________________________\n${repNome} — ${repCargo}\n${rz} — CNPJ ${cnpj}`;

  return [
    {
      id: "habilitacao",
      nome: "Cumprimento dos requisitos de habilitação",
      texto: `DECLARAÇÃO DE CUMPRIMENTO DOS REQUISITOS DE HABILITAÇÃO\n\n${cab}, DECLARA, sob as penas da lei, que cumpre plenamente os requisitos de habilitação exigidos no instrumento convocatório e que inexiste fato superveniente impeditivo de sua habilitação, ciente da obrigatoriedade de declarar ocorrências posteriores.${rodape}`,
    },
    {
      id: "meepp",
      nome: "Enquadramento ME/EPP (LC 123/2006)",
      texto: `DECLARAÇÃO DE ENQUADRAMENTO COMO MICROEMPRESA OU EMPRESA DE PEQUENO PORTE\n\n${cab}, DECLARA, para fins de participação nesta licitação e fruição dos benefícios da Lei Complementar nº 123/2006, que se enquadra como Microempresa (ME) ou Empresa de Pequeno Porte (EPP), não incorrendo em nenhuma das vedações do art. 3º, § 4º, da referida Lei Complementar.${rodape}`,
    },
    {
      id: "menor",
      nome: "Não emprego de menor (CF art. 7º, XXXIII)",
      texto: `DECLARAÇÃO DE CUMPRIMENTO DO DISPOSTO NO ART. 7º, XXXIII, DA CONSTITUIÇÃO FEDERAL\n\n${cab}, DECLARA, para os fins do disposto no art. 7º, inciso XXXIII, da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre, e não emprega menor de 16 (dezesseis) anos, salvo na condição de aprendiz a partir dos 14 (quatorze) anos.${rodape}`,
    },
    {
      id: "idoneidade",
      nome: "Inexistência de fato impeditivo / idoneidade",
      texto: `DECLARAÇÃO DE INEXISTÊNCIA DE FATO IMPEDITIVO\n\n${cab}, DECLARA, sob as penas da lei, que não foi declarada inidônea para licitar ou contratar com a Administração Pública, em qualquer de suas esferas, e que se compromete a comunicar a superveniência de qualquer fato impeditivo da habilitação.${rodape}`,
    },
    {
      id: "proposta",
      nome: "Elaboração independente de proposta",
      texto: `DECLARAÇÃO DE ELABORAÇÃO INDEPENDENTE DE PROPOSTA\n\n${cab}, DECLARA que a proposta apresentada foi elaborada de maneira independente, sem qualquer comunicação, ajuste ou combinação com outros licitantes, de forma direta ou indireta, no que se refere a preços ou condições da disputa, em observância à livre concorrência.${rodape}`,
    },
  ];
}
