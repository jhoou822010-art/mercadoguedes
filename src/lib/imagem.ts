/**
 * Reduz uma imagem escolhida pelo usuário para guardar no banco como texto (data URL).
 * Mantém a proporção, limita o maior lado a `maximo` pixels e tenta ficar abaixo de ~250 KB.
 */
export async function reduzirImagem(arquivo: File, maximo = 320): Promise<string> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (PNG, JPG, WEBP ou SVG).");
  if (arquivo.size > 15 * 1024 * 1024) throw new Error("A imagem é muito grande (máximo 15 MB).");

  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não consegui abrir essa imagem. Tente outro arquivo (PNG ou JPG)."));
      i.src = url;
    });
    const larguraOriginal = img.naturalWidth || 512;
    const alturaOriginal = img.naturalHeight || 512;
    const escala = Math.min(1, maximo / Math.max(larguraOriginal, alturaOriginal));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(larguraOriginal * escala));
    canvas.height = Math.max(1, Math.round(alturaOriginal * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // PNG mantém fundo transparente; se ficar pesado, usa WEBP e por fim JPEG.
    const limite = 250_000;
    let dados = canvas.toDataURL("image/png");
    if (dados.length > limite) dados = canvas.toDataURL("image/webp", 0.85);
    if (dados.length > limite || !dados.startsWith("data:image/webp")) {
      if (dados.length > limite) {
        const fundo = document.createElement("canvas");
        fundo.width = canvas.width;
        fundo.height = canvas.height;
        const f = fundo.getContext("2d")!;
        f.fillStyle = "#ffffff";
        f.fillRect(0, 0, fundo.width, fundo.height);
        f.drawImage(canvas, 0, 0);
        dados = fundo.toDataURL("image/jpeg", 0.8);
      }
    }
    if (dados.length > 400_000) throw new Error("Mesmo reduzida, a imagem ficou grande demais. Tente uma imagem mais simples.");
    return dados;
  } finally {
    URL.revokeObjectURL(url);
  }
}
