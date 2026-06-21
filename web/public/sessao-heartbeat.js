// Heartbeat de sessao unica. Incluido em todas as paginas logadas.
// Checa periodicamente se a sessao ainda vale. Se foi ENCERRADA (login em outro
// dispositivo), desloga na hora. "sem-sessao" (acesso legado so por link, sem
// cookie) e ignorado de proposito — nao derruba ninguem a toa.
(function () {
  let parado = false;
  async function checar() {
    if (parado || document.hidden) return;
    try {
      const d = await (await fetch("/api/sessao/ping", { cache: "no-store" })).json();
      if (d.estado === "encerrada") {
        parado = true;
        alert("Sua conta foi acessada em outro dispositivo. Por segurança, só uma sessão fica ativa por vez. Faça login novamente.");
        location.href = "/entrar?sessao=revogada";
      }
    } catch (e) { /* rede instavel: tenta no proximo ciclo */ }
  }
  setInterval(checar, 45000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checar(); });
})();
