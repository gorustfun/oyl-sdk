import { MnemonicToAccountOptions } from '../account'
import { Provider } from '../provider/provider'
import { Network, NetworkOptions } from './interface'
import * as bitcoin from 'bitcoinjs-lib'

export const UTXO_DUST = 546

export const maximumScriptBytes = 520

export const MAXIMUM_FEE = 5000000

export const regtestProvider = new Provider({
  url: 'http://localhost:3000',
  projectId: 'regtest',
  network: bitcoin.networks.regtest,
  networkType: 'mainnet',
})

export const regtestOpts: MnemonicToAccountOptions = {
  network: bitcoin.networks.regtest,
  index: 0,
}

export const regtestMnemonic: string = process.env.REGTEST1!.trim()

export const getBrc20Data = ({
  amount,
  tick,
}: {
  amount: number | string
  tick: string
}) => ({
  mediaContent: `{"p":"brc-20","op":"transfer","tick":"${tick}","amt":"${amount}"}`,
  mediaType: 'text/plain',
})

export const defaultNetworkOptions: Record<Network, NetworkOptions> = {
  mainnet: {
    baseUrl: 'https://mainnet.sandshrew.io',
    version: 'v1',
    projectId: process.env.SANDSHREW_PROJECT_ID,
    network: 'mainnet',
    apiUrl: 'https://api.oyl.gg',
  },
  testnet: {
    baseUrl: 'https://testnet.sandshrew.io',
    version: 'v1',
    projectId: process.env.SANDSHREW_PROJECT_ID,
    network: 'testnet',
    apiUrl: 'https://api.oyl.gg',
  },
  regtest: {
    baseUrl: 'http://localhost:3000',
    version: 'v1',
    projectId: 'regtest',
    network: 'regtest',
    apiUrl: 'https://api.oyl.gg',
  },
  signet: {
    baseUrl: 'https://signet.sandshrew.io',
    version: 'v1',
    projectId: process.env.SANDSHREW_PROJECT_ID,
    network: 'signet',
    apiUrl: 'https://api.oyl.gg',
  },
}
