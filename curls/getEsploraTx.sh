curl -s 'http://localhost:3000/v1/regtest' \
--header 'Content-Type: application/json' \
--data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "esplora_tx",
    "params": ["b3b9ce5b174aba757ce149d9df1fe573e0efa59be365215f70e548180f23e1b2"]
}' | jq .
