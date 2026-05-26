# Álbum Completo

Site de venda do PDF digital das figurinhas, com checkout Pix, webhook de pagamento e download liberado somente após a confirmação.

## Deploy no Railway

1. Crie um novo projeto no Railway usando este repositorio.
2. Configure as variaveis de ambiente com base em `.env.example`.
3. No provedor de pagamento, configure o postback para:

```txt
https://SEU-DOMINIO.up.railway.app/api/webhooks/ironpay
```

O Railway usa `npm start` e a rota `/health` como healthcheck.

## Produto

- Nome: `Álbum Completo`
- Valor: `R$ 29,90`
- Arquivo protegido: `private/Album Completo - Figurinhas.pdf`

O arquivo da pasta `private` não é servido como estático. Ele só sai pela rota de download quando o pedido está pago e com token válido.
