# Guessify V7 — Cápsula Sonora + Ranking

Esta versão mantém o jogo da V6 e adiciona uma **Cápsula Sonora mensal** acompanhada pelo Last.fm, além de um **ranking entre as pessoas conectadas ao mesmo servidor Guessify**.

## O que entrou na V7

- Jogo Spotify mantido com os tempos `0.5s → 1s → 1.5s → 2s → 3s → 6s`.
- Trecho aleatório da música mantido.
- Nova aba **Cápsula Sonora**.
- Mostra **Top 5 músicas** e **Top 5 artistas** do mês atual.
- Mostra o que está **tocando agora** no Last.fm.
- Conta scrobbles, músicas diferentes, artistas diferentes e dias ativos.
- Calcula **minutos estimados** a partir dos scrobbles e das durações das faixas.
- Nova aba **Ranking mensal** por minutos estimados e scrobbles.
- O Last.fm continua acompanhando o Spotify mesmo quando o Guessify está fechado, desde que o usuário tenha conectado Spotify ao Last.fm.

## Importante sobre os minutos

Os minutos são uma **estimativa**, não um número oficial do Spotify. O Last.fm registra os scrobbles; o Guessify combina esses registros com a duração conhecida das faixas para chegar o mais perto possível.

A V7 cria um cache de durações em `data/durations.json`, então a estimativa tende a ficar melhor/mais rápida conforme as músicas vão sendo conhecidas pelo servidor.

## 1. Configurar o Spotify

Como nas versões anteriores, abra `config.js` e coloque seu Client ID:

```js
window.GUESSIFY_CONFIG = {
  spotifyClientId: "SEU_CLIENT_ID",
  redirectUri: "http://127.0.0.1:5173/",
  roundsPerGame: 10
};
```

No Dashboard do Spotify, mantenha esta Redirect URI:

```text
http://127.0.0.1:5173/
```

## 2. Criar a chave da API do Last.fm

Só o **dono do Guessify** precisa criar uma API Key. Seus amigos não precisam criar chaves próprias.

1. Tenha uma conta Last.fm.
2. Entre na área de API do Last.fm e crie uma API account.
3. Copie a **API Key**.
4. Abra `server.config.json` e cole:

```json
{
  "lastfmApiKey": "SUA_API_KEY_AQUI",
  "rankingRefreshSeconds": 180,
  "capsuleCacheSeconds": 60
}
```

Não é necessário colocar o Shared Secret nesta V7 porque usamos somente endpoints públicos de leitura.

## 3. Cada usuário conecta Spotify ao Last.fm uma vez

Cada pessoa que quiser a Cápsula precisa ter uma conta Last.fm e ativar o rastreamento do Spotify no Last.fm.

Página oficial:

```text
https://www.last.fm/pt/about/trackmymusic?lang=pt
```

Depois disso ela pode usar Spotify normalmente no celular, PC, TV, Web Player etc. O Last.fm fará os scrobbles.

No Guessify, a pessoa entra em **Cápsula Sonora** e digita o próprio usuário do Last.fm uma única vez.

## 4. Rodar

Dentro da pasta:

```bash
node serve.mjs
```

Abra:

```text
http://127.0.0.1:5173/
```

## Frequência de atualização

- **Tocando agora:** consulta aproximadamente a cada 15 segundos enquanto a aba Cápsula está aberta.
- **Cápsula completa:** atualiza aproximadamente a cada 60 segundos enquanto aberta.
- **Ranking:** os dados guardados são atualizados no máximo a cada ~3 minutos por padrão; o botão “Atualizar ranking” força uma atualização.
- Mesmo se o usuário não estiver no Guessify, o Last.fm continua registrando o Spotify. Quando a Cápsula/Ranking for consultada, o Guessify lê os scrobbles novos.

## Como o ranking funciona nesta V7

Os usuários conectados são salvos em:

```text
data/profiles.json
```

Se você colocar este projeto num servidor público, todas as pessoas que usam **esse mesmo servidor** aparecem no mesmo ranking.

Para um MVP com amigos isso funciona bem. Para lançar para muita gente, o próximo passo é mover usuários, cache e ranking para PostgreSQL/Supabase e fazer atualizações por fila/cron no backend.

## Estrutura

```text
index.html
styles.css
app.js
config.js                  # Spotify Client ID
server.config.json         # Last.fm API Key (não subir público)
serve.mjs                  # servidor + API da Cápsula

data/
  profiles.json            # pessoas conectadas
  durations.json           # cache de duração das faixas
```

## Observação

Top 5 e contagens da Cápsula são montados com os scrobbles do **mês de calendário atual** (por exemplo, 1 a 30 de setembro), em vez de simplesmente usar um período móvel de 30 dias.
