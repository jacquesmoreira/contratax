// Hash de senha com scrypt (embutido no Node, zero dependencia). Nunca guardamos
// a senha em texto: guardamos "salt:hash". A verificacao e em tempo constante.

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashSenha(senha) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verificarSenha(senha, armazenado) {
  if (!senha || !armazenado || !armazenado.includes(":")) return false;
  const [salt, hash] = armazenado.split(":");
  const teste = scryptSync(senha, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(teste, "hex"));
  } catch {
    return false;
  }
}
