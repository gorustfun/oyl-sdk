# Metashrew RPC Implementation Plan

This document outlines the implementation plan for adding Metashrew RPC URL support to the Oyl SDK. The goal is to allow the AlkanesRpc client to point directly to a Metashrew RPC URL, bypassing the standard Alkanes RPC endpoint when needed.

## Overview

We will implement a `--metashrew-rpc-url` flag for alkane-specific commands that will allow users to specify a direct Metashrew RPC URL. When this flag is provided, the AlkanesRpc client will use this URL directly and adapt the method calls appropriately.

## Implementation Steps

### 1. Modify AlkanesRpc Class

**File**: `src/rpclient/alkanes.ts`

**Changes**:

1. Add a `metashrewUrl` property to store the optional Metashrew RPC URL
2. Update the constructor to accept this optional parameter
3. Modify the `_call` method to use the Metashrew URL when provided and adapt the method calls

```typescript
export class AlkanesRpc {
  public alkanesUrl: string
  public esplora: EsploraRpc
  private metashrewUrl: string | null

  constructor(url: string, metashrewUrl?: string) {
    this.alkanesUrl = url
    this.esplora = new EsploraRpc(url)
    this.metashrewUrl = metashrewUrl || null
  }

  async _call(method: string, params = []) {
    // If metashrewUrl is provided, use it directly
    const useUrl = this.metashrewUrl || this.alkanesUrl
    
    // Convert method name if using metashrew directly
    let requestMethod = method
    let requestParams = params
    
    if (this.metashrewUrl) {
      // For metashrew, we need to convert the method name
      const split = method.split('_')
      if (split.length === 1) {
        // If no namespace is provided, use metashrew_view
        requestMethod = 'metashrew_view'
        // For metashrew_view, the first param is the method name, followed by the original params
        requestParams = [method, ...params]
      } else if (split[0] === 'alkanes') {
        // If the namespace is 'alkanes', use metashrew_view with the method part
        requestMethod = 'metashrew_view'
        requestParams = [split[1], ...params]
      }
    }

    const requestData = {
      jsonrpc: '2.0',
      method: requestMethod,
      params: requestParams,
      id: 1,
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
      cache: 'no-cache',
    }

    try {
      const response = await fetch(useUrl, requestOptions)
      const responseData = await response.json()

      if (responseData.error) throw new Error(responseData.error.message)
      return responseData.result
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request Timeout:', error)
        throw new Error('Request timed out')
      } else {
        console.error('Request Error:', error)
        throw error
      }
    }
  }

  // The rest of the class remains unchanged
}
```

### 2. Update Provider Class

**File**: `src/provider/provider.ts`

**Changes**:

1. Add a `metashrewRpcUrl` parameter to the `ProviderConstructorArgs` interface
2. Update the constructor to accept and pass this parameter to the AlkanesRpc constructor

```typescript
export type ProviderConstructorArgs = {
  url: string
  projectId: string
  network: bitcoin.networks.Network
  networkType: 'signet' | 'mainnet' | 'testnet' | 'regtest'
  version?: string
  apiProvider?: any
  metashrewRpcUrl?: string  // Add this new parameter
}

export class Provider {
  // Existing properties remain unchanged
  
  constructor({
    url,
    projectId,
    network,
    networkType,
    version = 'v1',
    apiProvider,
    metashrewRpcUrl,  // Add this parameter
  }: ProviderConstructorArgs) {
    let isTestnet: boolean
    let isRegtest: boolean
    switch (network) {
      case bitcoin.networks.testnet:
        isTestnet = true

      case bitcoin.networks.regtest:
        isRegtest = true
    }
    const masterUrl = [url, version, projectId].filter(Boolean).join('/');
    this.alkanes = new AlkanesRpc(masterUrl, metashrewRpcUrl)  // Pass metashrewRpcUrl
    this.sandshrew = new SandshrewBitcoinClient(masterUrl)
    this.esplora = new EsploraRpc(masterUrl)
    this.ord = new OrdRpc(masterUrl)
    this.api = apiProvider
    this.network = network
    this.networkType = networkType
    this.url = masterUrl
  }
  
  // The rest of the class remains unchanged
}
```

### 3. Update Wallet Class

**File**: `src/cli/wallet.ts`

**Changes**:

1. Add a `metashrewRpcUrl` parameter to the `WalletOptions` interface
2. Update the constructor to handle this parameter when creating providers

```typescript
export interface WalletOptions {
  mnemonic?: string
  networkType?: NetworkType
  feeRate?: number
  provider?: Provider | string
  metashrewRpcUrl?: string  // Add this parameter
}

export class Wallet {
  // Existing properties remain unchanged

  constructor(options?: WalletOptions) {
    this.mnemonic =
      options?.mnemonic || process.env.MNEMONIC || TEST_WALLET.mnemonic
    this.networkType = options?.networkType || 'regtest'
    
    if (options?.provider && typeof options.provider === 'string') {
      // If a provider name is specified, get the default provider
      const defaultProvider = DEFAULT_PROVIDER[options.provider]
      
      if (options.metashrewRpcUrl) {
        // If metashrewRpcUrl is provided, create a new provider with it
        this.provider = new Provider({
          url: defaultProvider.url,
          projectId: defaultProvider.projectId || '',
          network: defaultProvider.network,
          networkType: defaultProvider.networkType,
          version: defaultProvider.version || 'v1',
          metashrewRpcUrl: options.metashrewRpcUrl
        })
      } else {
        this.provider = defaultProvider
      }
    } else if (options?.provider) {
      // If a provider instance is provided, use it directly
      this.provider = options.provider
    } else {
      // Use the default provider for the network type
      const defaultProvider = DEFAULT_PROVIDER[this.networkType]
      
      if (options?.metashrewRpcUrl) {
        // If metashrewRpcUrl is provided, create a new provider with it
        this.provider = new Provider({
          url: defaultProvider.url,
          projectId: defaultProvider.projectId || '',
          network: defaultProvider.network,
          networkType: defaultProvider.networkType,
          version: defaultProvider.version || 'v1',
          metashrewRpcUrl: options.metashrewRpcUrl
        })
      } else {
        this.provider = defaultProvider
      }
    }
    
    // The rest of the constructor remains unchanged
    this.account = mnemonicToAccount({
      mnemonic: this.mnemonic,
      opts: {
        network: this.provider.network,
      },
    })

    const privateKeys = getWalletPrivateKeys({
      mnemonic: this.mnemonic,
      opts: {
        network: this.account.network,
      },
    })

    this.signer = new Signer(this.account.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey,
    })

    this.feeRate = options?.feeRate ? options?.feeRate : 2
  }
}
```

### 4. Update Alkane CLI Commands

**File**: `src/cli/alkane.ts`

**Changes**:

Add the `--metashrew-rpc-url` option to each alkane command and update the Wallet instantiation to pass this parameter.

Here's an example for the `alkanesTrace` command:

```typescript
export const alkanesTrace = new Command('trace')
  .description('Returns data based on txid and vout of deployed alkane')
  .option('-p, --provider <provider>', 'provider to use to access the network.')
  .option(
    '-params, --parameters <parameters>',
    'parameters for the ord method you are calling.'
  )
  .option(
    '--metashrew-rpc-url <url>',
    'Direct URL to metashrew RPC endpoint'
  )
  .action(async (options) => {
    const wallet: Wallet = new Wallet({
      provider: options.provider,
      metashrewRpcUrl: options.metashrewRpcUrl
    })
    let isJson: { vout: number; txid: string }
    isJson = JSON.parse(options.parameters)
    const { vout, txid } = isJson
    console.log(
      JSON.stringify(
        await wallet.provider.alkanes.trace({
          vout,
          txid,
        })
      )
    )
  })
```

**Add the same option to all other alkane commands**:

- `alkaneContractDeploy`
- `alkaneExecute`
- `alkaneTokenDeploy`
- `alkaneSend`
- `alkaneSplit`
- `alkaneCreatePool`
- `alkaneAddLiquidity`
- `alkaneRemoveLiquidity`
- `alkaneSwap`
- `alkaneSimulate`
- `alkaneGetAllPoolsDetails`

For each command, add the option and update the Wallet instantiation to include the `metashrewRpcUrl` parameter.

## Implementation Order

Follow this order to implement the changes:

1. First, modify the `AlkanesRpc` class in `src/rpclient/alkanes.ts`
2. Then update the `Provider` class in `src/provider/provider.ts`
3. Update the `Wallet` class in `src/cli/wallet.ts`
4. Finally, add the `--metashrew-rpc-url` option to all alkane commands in `src/cli/alkane.ts`

## Testing Instructions

After implementing the changes, test the functionality with the following scenarios:

1. **Test with standard Alkanes RPC URL**:
   ```bash
   oyl alkane trace -params '{"txid":"0322c3a2ce665485c8125cd0334675f0ddbd7d5b278936144efb108ff59c49b5","vout":0}'
   ```
   This should work as before, using the standard Alkanes RPC endpoint.

2. **Test with Metashrew RPC URL**:
   ```bash
   oyl alkane trace --metashrew-rpc-url http://pyrosec.is:8090 -params '{"txid":"a56a9492a24f85a1deef3eb628d6e1d3a827fc6f75e315bfb88ee0c6540c1b78","vout":3}'
   ```
   This should use the Metashrew RPC endpoint directly.

3. **Test error handling**:
   ```bash
   oyl alkane trace --metashrew-rpc-url http://invalid-url -params '{"txid":"0322c3a2ce665485c8125cd0334675f0ddbd7d5b278936144efb108ff59c49b5","vout":0}'
   ```
   This should handle the error gracefully.

4. **Test with other alkane commands**:
   Test the `--metashrew-rpc-url` flag with other alkane commands to ensure it works consistently.

## Notes

- The implementation adapts the shim approach from `/home/lee/apps/sandshrew/alkanes/integration/lib/shim.ts` but is tailored for the Oyl SDK.
- No special authentication is needed for the Metashrew endpoint.
- The changes are focused only on alkane-specific commands to keep the implementation targeted.