// Extrator de ZIP minimo, usando apenas o zlib embutido do Node (zero dependencia).
// Le pelo Diretorio Central (robusto a zips com data descriptor), descomprime as
// entradas e devolve { nome, dados(Buffer) }. Suficiente para os zips do PNCP.

import { inflateRawSync } from "node:zlib";

const FIM_DIR_CENTRAL = 0x06054b50; // End of Central Directory
const CABECALHO_CENTRAL = 0x02014b50; // Central Directory File Header

export function extrairZip(buf) {
  // Procura o registro de fim do diretorio central, varrendo do fim do arquivo.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === FIM_DIR_CENTRAL) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP invalido: fim do diretorio central nao encontrado");

  const totalEntradas = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // inicio do diretorio central

  const arquivos = [];
  for (let n = 0; n < totalEntradas; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CABECALHO_CENTRAL) break;

    const metodo = buf.readUInt16LE(off + 10);
    const tamComp = buf.readUInt32LE(off + 20);
    const tamNome = buf.readUInt16LE(off + 28);
    const tamExtra = buf.readUInt16LE(off + 32);
    const tamComentario = buf.readUInt16LE(off + 34);
    const offLocal = buf.readUInt32LE(off + 42);
    const nome = buf.toString("utf8", off + 46, off + 46 + tamNome);

    // No cabecalho local, os campos de nome/extra podem ter tamanhos proprios.
    const lTamNome = buf.readUInt16LE(offLocal + 26);
    const lTamExtra = buf.readUInt16LE(offLocal + 28);
    const inicioDados = offLocal + 30 + lTamNome + lTamExtra;
    const comprimido = buf.subarray(inicioDados, inicioDados + tamComp);

    try {
      let dados;
      if (metodo === 0) dados = comprimido; // armazenado sem compressao
      else if (metodo === 8) dados = inflateRawSync(comprimido); // deflate
      else dados = null; // metodo nao suportado
      if (dados) arquivos.push({ nome, dados });
    } catch {
      // entrada corrompida: ignora e segue para as demais
    }

    off += 46 + tamNome + tamExtra + tamComentario;
  }
  return arquivos;
}
