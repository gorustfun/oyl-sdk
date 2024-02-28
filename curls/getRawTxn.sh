curl --location 'https://testnet.sandshrew.io/v1/6e3bc3c289591bb447c116fda149b094' \
--header 'Content-Type: application/json' \
--data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "btc_getrawtransaction",
    "params": ["3fe0dba8e2d1549893cd9ddbae2f1cf6e4164283e390ca3c72c3bb5857c80a4d"]
}' | jq .
