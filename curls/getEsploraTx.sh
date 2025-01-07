curl -s 'http://localhost:3000/v1/regtest' \
--header 'Content-Type: application/json' \
--data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "esplora_tx",
    "params": ["86f19568fb81f82950cecc2f2e18d59137d82073cc7c4269cb3354eb6a1d31a6"]
}' | jq .
