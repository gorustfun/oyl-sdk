curl -s 'http://localhost:18888/v1/regtest' \
--header 'Content-Type: application/json' \
--data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "esplora_tx",
    "params": ["6dbdd95a01a86684eee385b584d02c82f37d45ce3f9607707131b77fe1b4fa43"]
}' | jq .
