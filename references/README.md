# Referências locais (não versionadas)

Esta pasta é para material de regras **copyrighted** usado pelo PO/agentes
durante o desenvolvimento. O conteúdo é ignorado pelo Git (`references/*`,
exceto este README). **Não commitar PDFs.**

## Ordem Paranormal (prioridade da primeira sessão)

Colocar os arquivos em:

```text
references/ordem-paranormal/
```

Arquivos recebidos e lidos (nomes atuais):

```text
ordem-paranormal-rpg.pdf                 # OP1 core v1.1 (330 pág.)
op1-sobrevivendo-ao-horror.pdf           # suplemento OPSH (226 pág.)
op2-playtest-beta-contos-da-vigilia.pdf  # Beta (referência primária do OP2)
op2-maldicao-do-idolo-de-pedra.pdf       # Alpha (compatibilidade)
Ordem-2-Playtest-Beta-Missao-*-Extras.zip
Ordem-2-Playtest-Alpha-Ato-*-Extras.zip
```

Os zips foram extraídos em `extracted/` e os textos em `text/` (também
ignorados pelo Git). O contrato final está em `docs/ORDEM_PARANORMAL.md`.

O PO vai ler os PDFs localmente, extrair os campos/regras e transformar em
contrato (`docs/ORDEM_PARANORMAL.md`), sem copiar texto protegido para o
repositório.

## O que será extraído

- Atributos (Físico, Mente, Emoção) e os dados associados.
- Lista de perícias, dados e vínculo com atributo.
- Perfis (Executor, Analista, Vigilante), ocupações, idade, nível e NEX.
- Vida, PD, Defesa, iniciativa, deslocamento.
- Teste básico: dois dados (atributo + perícia), soma vs DT, RA/RB, crítico e
  falha crítica.
- Combate simplificado, armas, dano, condições e medo.
- Rituais, inventário e progressão.
- Regras de *Sobrevivendo ao Horror* que a mesa for usar (PD, medo, traumas,
  lesões) e como se encaixam no OP2.
- Layout da ficha e limites de campos.
