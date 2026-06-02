// Catalogo de ramos (categorias) para o SEO programatico. Cada um vira paginas
// publicas indexaveis: /licitacoes/<slug> e /licitacoes/<slug>/<uf>.
// termo = o que alimenta a busca no acervo (casamento tolerante a acento/plural).

export const CATEGORIAS = [
  { slug: "material-hospitalar", nome: "Material Hospitalar", termo: "material hospitalar" },
  { slug: "medicamentos", nome: "Medicamentos", termo: "medicamento" },
  { slug: "material-de-escritorio", nome: "Material de Escritório", termo: "material de expediente" },
  { slug: "material-escolar", nome: "Material Escolar", termo: "material escolar" },
  { slug: "merenda-escolar", nome: "Merenda Escolar", termo: "merenda" },
  { slug: "generos-alimenticios", nome: "Gêneros Alimentícios", termo: "genero alimenticio" },
  { slug: "limpeza-e-conservacao", nome: "Limpeza e Conservação", termo: "limpeza conservacao" },
  { slug: "vigilancia-e-seguranca", nome: "Vigilância e Segurança", termo: "vigilancia" },
  { slug: "informatica", nome: "Informática", termo: "informatica" },
  { slug: "computadores", nome: "Computadores", termo: "computador" },
  { slug: "moveis-e-mobiliario", nome: "Móveis e Mobiliário", termo: "mobiliario" },
  { slug: "uniformes", nome: "Uniformes", termo: "uniforme" },
  { slug: "combustivel", nome: "Combustível", termo: "combustivel" },
  { slug: "pneus", nome: "Pneus", termo: "pneu" },
  { slug: "veiculos", nome: "Veículos", termo: "veiculo" },
  { slug: "locacao-de-veiculos", nome: "Locação de Veículos", termo: "locacao de veiculo" },
  { slug: "material-de-construcao", nome: "Material de Construção", termo: "material de construcao" },
  { slug: "obras-e-engenharia", nome: "Obras e Engenharia", termo: "obra" },
  { slug: "reforma-predial", nome: "Reforma Predial", termo: "reforma" },
  { slug: "manutencao-predial", nome: "Manutenção Predial", termo: "manutencao predial" },
  { slug: "ar-condicionado", nome: "Ar-Condicionado", termo: "ar condicionado" },
  { slug: "equipamentos-medicos", nome: "Equipamentos Médicos", termo: "equipamento hospitalar" },
  { slug: "epi", nome: "EPI - Equipamento de Proteção", termo: "equipamento de protecao" },
  { slug: "grafica-e-impressos", nome: "Gráfica e Impressos", termo: "grafica" },
  { slug: "papelaria", nome: "Papelaria", termo: "papelaria" },
  { slug: "telefonia", nome: "Telefonia", termo: "telefonia" },
  { slug: "energia-eletrica", nome: "Energia Elétrica", termo: "energia eletrica" },
  { slug: "transporte-escolar", nome: "Transporte Escolar", termo: "transporte escolar" },
  { slug: "coleta-de-residuos", nome: "Coleta de Resíduos", termo: "coleta de residuo" },
  { slug: "jardinagem-e-paisagismo", nome: "Jardinagem e Paisagismo", termo: "jardinagem" },
  { slug: "alimentacao-e-refeicoes", nome: "Alimentação e Refeições", termo: "alimentacao" },
  { slug: "equipamentos-de-informatica", nome: "Equipamentos de Informática", termo: "equipamento de informatica" },
  { slug: "material-eletrico", nome: "Material Elétrico", termo: "material eletrico" },
  { slug: "ferramentas", nome: "Ferramentas", termo: "ferramenta" },
  { slug: "servicos-de-engenharia", nome: "Serviços de Engenharia", termo: "servico de engenharia" },
  { slug: "consultoria", nome: "Consultoria", termo: "consultoria" },
];

export const UFS = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" }, { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" }, { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
];

export const categoriaPorSlug = (slug) => CATEGORIAS.find((c) => c.slug === slug) || null;
export const ufPorSigla = (sigla) => UFS.find((u) => u.sigla === (sigla || "").toUpperCase()) || null;
