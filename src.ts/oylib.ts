import { UTXO_DUST, defaultNetworkOptions } from './shared/constants'

import { findUtxosToCoverAmount, OGPSBTTransaction } from './txbuilder'

import {
  delay,
  inscribe,
  createBtcTx,
  getNetwork,
  isValidJSON,
  waitForTransaction,
  formatOptionsToSignInputs,
  signInputs,
  calculateTaprootTxSize,
  calculateAmountGatheredUtxo,
  filterTaprootUtxos,
  createTaprootBtcTx,
} from './shared/utils'
import { SandshrewBitcoinClient } from './rpclient/sandshrew'
import { EsploraRpc } from './rpclient/esplora'
import * as transactions from './transactions'
import { publicKeyToAddress } from './wallet/accounts'
import { accounts } from './wallet'
import { AccountManager, customPaths } from './wallet/accountsManager'

import {
  AddressType,
  HistoryTx,
  HistoryTxBrc20Inscription,
  HistoryTxCollectibleInscription,
  IBlockchainInfoUTXO,
  InscriptionType,
  Providers,
  RecoverAccountOptions,
  TickerDetails,
  ToSignInput,
} from './shared/interface'
import { OylApiClient } from './apiclient'
import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from './rpclient/provider'
import { OrdRpc } from './rpclient/ord'
import { HdKeyring } from './wallet/hdKeyring'
import { getAddressType } from './transactions'
import { Signer } from './signer'

export const NESTED_SEGWIT_HD_PATH = "m/49'/0'/0'/0"
export const TAPROOT_HD_PATH = "m/86'/0'/0'/0"
export const SEGWIT_HD_PATH = "m/84'/0'/0'/0"
export const LEGACY_HD_PATH = "m/44'/0'/0'/0"

const RequiredPath = [
  LEGACY_HD_PATH,
  NESTED_SEGWIT_HD_PATH,
  SEGWIT_HD_PATH,
  TAPROOT_HD_PATH,
]

export class Oyl {
  private mnemonic: String
  private wallet
  public network: bitcoin.Network
  public sandshrewBtcClient: SandshrewBitcoinClient
  public esploraRpc: EsploraRpc
  public ordRpc: OrdRpc
  public provider: Providers
  public apiClient: OylApiClient
  public derivPath: String
  public currentNetwork: 'testnet' | 'main' | 'regtest'

  /**
   * Initializes a new instance of the Wallet class.
   */
  constructor(opts = defaultNetworkOptions.mainnet) {
    const options = {
      ...defaultNetworkOptions[opts.network],
      ...opts,
    }

    const apiKey = options.projectId

    this.apiClient = new OylApiClient({
      host: 'https://api.oyl.gg',
      testnet: options.network == 'testnet' ? true : null,
      apiKey: apiKey,
    })
    const rpcUrl = `${options.baseUrl}/${options.version}/${options.projectId}`
    const provider = new Provider(rpcUrl)
    this.network = getNetwork(options.network)
    this.sandshrewBtcClient = provider.sandshrew
    this.esploraRpc = provider.esplora
    this.ordRpc = provider.ord
    this.currentNetwork =
      options.network === 'mainnet' ? 'main' : options.network
  }

  /**
   * Gets a summary of the given address(es).
   * @param {string | string[]} address - A single address or an array of addresses.
   * @returns {Promise<Object[]>} A promise that resolves to an array of address summaries.
   */
  async getAddressSummary({
    address,
    includeInscriptions,
  }: {
    address: string
    includeInscriptions?: boolean
  }) {
    const addressesUtxo = {}
    let utxos = await this.getUtxos(address, includeInscriptions)
    addressesUtxo['utxos'] = utxos.unspent_outputs
    addressesUtxo['balance'] = transactions.calculateBalance(
      utxos.unspent_outputs
    )

    return addressesUtxo
  }

  /**
   * Derives a Taproot address from the given public key.
   * @param {string} publicKey - The public key to derive the address from.
   * @returns {string} A promise that resolves to the derived Taproot address.
   */
  getTaprootAddress({ publicKey }) {
    try {
      const address = publicKeyToAddress(
        publicKey,
        AddressType.P2TR,
        this.network
      )
      return address
    } catch (err) {
      return err
    }
  }

  /**
   * Retrieves details for a specific BRC-20 token associated with the given address.
   * @param {string} address - The address to query BRC-20 token details from.
   * @param {string} ticker - The ticker symbol of the BRC-20 token to retrieve details for.
   * @returns {Promise<TickerDetails>} A promise that resolves to the details of the specified BRC-20 token.
   */
  async getSingleBrcTickerDetails(
    address: string,
    ticker: string
  ): Promise<TickerDetails> {
    const response = await this.apiClient.getBrc20sByAddress(address)
    const tickerDetails = response.data.find(
      (details) => details.ticker.toLowerCase() === ticker.toLowerCase()
    )
    return tickerDetails
  }

  /**
   * Initializes a wallet from a mnemonic phrase with the specified parameters.
   * @param {Object} options - The options object.
   * @param {string} options.mnemonic - The mnemonic phrase used to initialize the wallet.
   * @param {string} [options.type='taproot'] - The type of wallet to create. Options are 'taproot', 'segwit', 'legacy'.
   * @param {string} [options.hdPath=RequiredPath[3]] - The HD path to derive addresses from.
   * @returns {Promise<any>} A promise that resolves to the wallet data including keyring and assets.
   * @throws {Error} Throws an error if initialization fails.
   */
  async fromPhrase({
    mnemonic,
    addrType = AddressType.P2TR,
    hdPath = RequiredPath[3],
  }) {
    try {
      const wallet = await accounts.importMnemonic(
        mnemonic,
        hdPath,
        addrType,
        this.network
      )

      this.wallet = wallet
      const data = {
        keyring: wallet,
      }
      this.mnemonic = mnemonic
      return data
    } catch (err) {
      return err
    }
  }

  /**
   * Recovers a wallet using the given options.
   * @param {RecoverAccountOptions} options - Options necessary for account recovery.
   * @returns {Promise<any>} A promise that resolves to the recovered wallet payload.
   * @throws {Error} Throws an error if recovery fails.
   */
  async recoverWallet(options: Omit<RecoverAccountOptions, 'network'>) {
    try {
      const wallet = new AccountManager({ ...options, network: this.network })
      const walletPayload = await wallet.recoverAccounts()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Adds a new account to the wallet using the given options.
   * @param {RecoverAccountOptions} options - Options describing the account to be added.
   * @returns {Promise<any>} A promise that resolves to the payload of the newly added account.
   * @throws {Error} Throws an error if adding the account fails.
   */
  async addAccountToWallet(options: Omit<RecoverAccountOptions, 'network'>) {
    try {
      const wallet = new AccountManager({ ...options, network: this.network })
      const walletPayload = await wallet.addAccount()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Initializes a new Oyl account with taproot & segwit HDKeyrings  within the wallet.
   * @returns {Promise<any>} A promise that resolves to the payload of the initialized accounts.
   * @throws {Error} Throws an error if the initialization fails.
   */
  async initializeWallet() {
    try {
      const wallet = new AccountManager({
        network: this.network,
        customPath: this.network == getNetwork('testnet') ? 'testnet' : null,
      })
      const walletPayload = await wallet.initializeAccounts()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Derives a SegWit address from a given public key.
   * @param {Object} param0 - An object containing the public key.
   * @param {string} param0.publicKey - The public key to derive the SegWit address from.
   * @returns {Promise<string>} A promise that resolves to the derived SegWit address.
   * @throws {Error} Throws an error if address derivation fails.
   */
  async getSegwitAddress({ publicKey }) {
    const address = publicKeyToAddress(
      publicKey,
      AddressType.P2WPKH,
      this.network
    )
    return address
  }

  /**
   * Creates a new Oyl with an optional specific derivation type.
   * @param {object} param0 - Object containing the type of derivation.
   * @param {string} [param0.type] - Optional type of derivation path.
   * @returns {{keyring: HdKeyring, address: string}} The newly created wallet object.
   */
  createWallet({ type }: { type?: String }) {
    try {
      let hdPath
      let addrType

      switch (type) {
        case 'taproot':
          addrType = AddressType.P2TR
          hdPath = RequiredPath[3]
          break
        case 'segwit':
          addrType = AddressType.P2WPKH
          hdPath = RequiredPath[2]
          break
        case 'nested-segwit':
          addrType = AddressType.P2SH_P2WPKH
          hdPath = RequiredPath[1]
        case 'legacy':
          addrType = AddressType.P2PKH
          hdPath = RequiredPath[0]
          break
        default:
          addrType = AddressType.P2TR
          hdPath = RequiredPath[3]
          break
      }

      const wallet = accounts.createWallet(hdPath, addrType, this.network)
      return wallet
    } catch (err) {
      return err
    }
  }

  /**
   * Fetches the balance details including confirmed and pending amounts for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address for which to fetch balance details.
   * @returns {Promise<any>} A promise that resolves to an object containing balance and its USD value.
   * @throws {Error} Throws an error if the balance retrieval fails.
   */
  async getTaprootBalance({ address }) {
    const addressType = getAddressType(address)

    if (addressType !== 1) {
      throw new Error('Incorrect address type')
    }
    const txns: any[] = await this.esploraRpc.getAddressUtxo(address)

    let confirmedAmount = 0
    let pendingAmount = 0

    for (const utxo of txns) {
      const { txid, status, vout } = utxo
      let inscriptionsOnTx: any = await this.ordRpc.getTxOutput(
        `${txid}:${vout}`
      )
      if (inscriptionsOnTx.inscriptions.length === 0) {
        if (status.confirmed) confirmedAmount += utxo.value / 1e8
        if (!status.confirmed) pendingAmount += utxo.value / 1e8
      }
    }

    const amount = confirmedAmount + pendingAmount

    const usdValue = await transactions.convertUsdValue(amount)

    const response = {
      confirmedAmount: confirmedAmount.toFixed(8),
      pendingAmount: pendingAmount.toFixed(8),
      amount: amount.toFixed(8),
      usdValue: usdValue,
    }
    return response
  }

  async getUtxos(address: string, includeInscriptions: boolean = true) {
    const utxosResponse: any[] = await this.esploraRpc.getAddressUtxo(address)
    const formattedUtxos: IBlockchainInfoUTXO[] = []

    let filtered = utxosResponse
    if (!includeInscriptions) {
      filtered = utxosResponse.filter((utxo) => utxo.value > 546)
    }

    for (const utxo of filtered) {
      if (utxo.txid) {
        const transactionDetails = await this.esploraRpc.getTxInfo(utxo.txid)
        const voutEntry = transactionDetails.vout.find(
          (v) => v.scriptpubkey_address === address
        )

        formattedUtxos.push({
          tx_hash_big_endian: utxo.txid,
          tx_output_n: utxo.vout,
          value: utxo.value,
          confirmations: utxo.status.confirmed ? 3 : 0,
          script: voutEntry.scriptpubkey,
          tx_index: 0,
        })
      }
    }

    return { unspent_outputs: formattedUtxos }
  }

  /**
   * Retrieves the transaction history for a given address and processes the transactions.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address for which to fetch transaction history.
   * @returns {Promise<any[]>} A promise that resolves to an array of processed transaction details.
   * @throws {Error} Throws an error if transaction history retrieval fails.
   */
  async getTxHistory({ addresses }: { addresses: string[] }) {
    try {
      if (addresses.length > 2) {
        throw new Error('Only accepts a max of 2 addresses')
      }
      const utxoPromises = addresses.map((address: string, index: number) =>
        this.esploraRpc._call('esplora_address::txs', [address])
      )
      const currentBlock = await this.esploraRpc._call(
        'esplora_blocks:tip:height',
        []
      )
      const resolvedUtxoPromises = await Promise.all(utxoPromises)
      const combinedHistory = resolvedUtxoPromises.flat()
      const removedDuplicatesArray = new Map(
        combinedHistory.map((item) => [item.txid, item])
      )
      const finalCombinedHistory = Array.from(removedDuplicatesArray.values())
      const processedTxns = finalCombinedHistory.map((tx) => {
        const { txid, vout, size, vin, status, fee } = tx
        const blockDelta = currentBlock - status.block_height + 1
        const confirmations = blockDelta > 0 ? blockDelta : 0
        const inputAddress = vin.find(
          ({ prevout }) =>
            prevout.scriptpubkey_address === addresses[0] ||
            prevout.scriptpubkey_address === addresses[1]
        )

        let vinSum: number = 0
        let voutSum: number = 0

        for (let input of vin) {
          if (addresses.includes(input.prevout.scriptpubkey_address)) {
            vinSum += input.prevout.value
          }
        }
        for (let output of vout) {
          if (addresses.includes(output.scriptpubkey_address)) {
            voutSum += output.value
          }
        }

        const txDetails = {}
        txDetails['txId'] = txid
        txDetails['confirmations'] = confirmations
        txDetails['type'] = inputAddress ? 'sent' : 'received'
        txDetails['blockTime'] = status.block_time
        txDetails['blockHeight'] = status.block_height
        txDetails['fee'] = fee
        txDetails['feeRate'] = Math.floor(fee / size)
        txDetails['vinSum'] = vinSum
        txDetails['voutSum'] = voutSum
        txDetails['amount'] = inputAddress ? vinSum - voutSum - fee : voutSum
        txDetails['symbol'] = 'BTC'

        return txDetails
      })

      return processedTxns
    } catch (error) {
      console.log(error)
      throw new Error('Error fetching txn history')
    }
  }

  async getTaprootTxHistory({
    taprootAddress,
    totalTxs = 20,
  }: {
    taprootAddress: string
    totalTxs?: number
  }) {
    const addressType = getAddressType(taprootAddress)

    if (addressType === 1) {
      return await this.apiClient.getTaprootTxHistory(taprootAddress, totalTxs)
    } else {
      throw new Error('Invalid address type')
    }
  }

  /**
   * Retrieves a list of inscriptions for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for inscriptions.
   * @returns {Promise<Array<any>>} A promise that resolves to an array of inscription details.
   */
  async getInscriptions({ address }) {
    const collectibles = []
    const brc20 = []
    const allOrdinals: any[] = (
      await this.apiClient.getAllInscriptionsByAddress(address)
    ).data

    const allCollectibles: any[] = allOrdinals.filter(
      (ordinal: any) =>
        ordinal.mime_type === 'image/png' || ordinal.mime_type.includes('html')
    )

    const allBrc20s: any[] = allOrdinals.filter(
      (ordinal: any) => ordinal.mime_type === 'text/plain;charset=utf-8'
    )

    for (const artifact of allCollectibles) {
      const { inscription_id, inscription_number, satpoint } = artifact
      const content = await this.ordRpc.getInscriptionContent(inscription_id)

      const detail = {
        id: inscription_id,
        address: artifact.owner_wallet_addr,
        content: content,
        location: satpoint,
      }

      collectibles.push({
        id: inscription_id,
        inscription_number,
        detail,
      })
    }

    for (const artifact of allBrc20s) {
      const { inscription_id, inscription_number, satpoint } = artifact
      const content = await this.ordRpc.getInscriptionContent(inscription_id)
      const decodedContent = atob(content)

      if (isValidJSON(decodedContent) && JSON.parse(decodedContent)) {
        const detail = {
          id: inscription_id,
          address: artifact.owner_wallet_addr,
          content: content,
          location: satpoint,
        }

        brc20.push({
          id: inscription_id,
          inscription_number,
          detail,
        })
      }
    }
    return { collectibles, brc20 }
  }

  /**
   * Retrieves UTXO artifacts for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for UTXO artifacts.
   * @returns A promise that resolves to the UTXO artifacts.
   */
  async getUtxosArtifacts({ address }) {
    const { unspent_outputs } = await this.getUtxos(address, false)
    const inscriptions = await this.getInscriptions({ address })
    const utxoArtifacts = await transactions.getMetaUtxos(
      address,
      unspent_outputs,
      inscriptions
    )
    return utxoArtifacts as Array<{
      txId: string
      outputIndex: number
      satoshis: number
      scriptPk: string
      confirmations: number
      addressType: number
      address: string
      inscriptions: Array<{
        brc20: {
          id: string
          address: string
          content: string
          location: string
        }
      }>
    }>
  }

  /**
   * Creates a Partially Signed Bitcoin Transaction (PSBT) to send regular satoshis, signs and broadcasts it.
   * @param {Object} params - The parameters for creating the PSBT.
   * @param {string} params.to - The receiving address.
   * @param {string} params.from - The sending address.
   * @param {string} params.amount - The amount to send.
   * @param {number} params.feeRate - The transaction fee rate.
   * @param {any} params.signer - The bound signer method to sign the transaction.
   * @param {string} params.publicKey - The public key associated with the transaction.
   * @returns {Promise<Object>} A promise that resolves to an object containing transaction ID and other response data from the API client.
   */
  async sendBtc({
    to,
    from,
    amount,
    feeRate,
    publicKey,
    mnemonic,
    segwitAddress,
    segwitPubkey,
    segwitHdPath = 'oyl',
    payFeesWithSegwit = false,
  }: {
    to: string
    from: string
    amount: number
    feeRate?: number
    publicKey: string
    mnemonic: string
    segwitAddress?: string
    segwitPubkey?: string
    segwitHdPath?: 'oyl' | 'xverse' | 'leather' | 'unisat' | 'testnet'
    payFeesWithSegwit?: boolean
  }) {
    if (payFeesWithSegwit && (!segwitAddress || !segwitPubkey)) {
      throw new Error('Invalid segwit information entered')
    }
    const hdPaths = customPaths[segwitHdPath]
    const taprootSigner = await this.createTaprootSigner({
      mnemonic: mnemonic,
      taprootAddress: from,
      hdPathWithIndex: hdPaths['taprootPath'],
    })

    let segwitSigner

    if (segwitAddress) {
      segwitSigner = await this.createSegwitSigner({
        mnemonic: mnemonic,
        segwitAddress: segwitAddress,
        hdPathWithIndex: hdPaths['segwitPath'],
      })
    }

    const taprootUtxos = await this.getUtxosArtifacts({
      address: from,
    })

    let segwitUtxos: any[] | undefined
    if (segwitAddress) {
      segwitUtxos = await this.getUtxosArtifacts({
        address: segwitAddress,
      })
    }

    if (!feeRate) {
      feeRate = (await this.esploraRpc.getFeeEstimates())['1']
    }

    const { txnId, rawTxn } = await createBtcTx({
      inputAddress: from,
      outputAddress: to,
      amount: amount,
      feeRate: feeRate,
      segwitAddress: segwitAddress,
      segwitPublicKey: segwitPubkey,
      taprootPublicKey: publicKey,
      mnemonic: mnemonic,
      payFeesWithSegwit: payFeesWithSegwit,
      taprootSigner: taprootSigner,
      segwitSigner: segwitSigner,
      network: this.network,
      segwitUtxos: segwitUtxos,
      taprootUtxos: taprootUtxos,
    })

    const [result] =
      await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([rawTxn])

    if (!result.allowed) {
      throw new Error(result['reject-reason'])
    }

    await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(rawTxn)

    return { txnId: txnId, rawTxn: rawTxn }
  }

  /**
   * Creates a Partially Signed Bitcoin Transaction (PSBT) to send regular satoshis, signs and broadcasts it.
   * @param {Object} params - The parameters for creating the PSBT.
   * @param {string} params.to - The receiving address.
   * @param {string} params.from - The sending address.
   * @param {string} params.amount - The amount to send.
   * @param {number} params.feeRate - The transaction fee rate.
   * @param {any} params.privateKey - The private key associated with the transaction.
   * @returns {Promise<Object>} A promise that resolves to an object containing transaction ID and other response data from the API client.
   */

  async sendBtcTaproot({
    to,
    from,
    amount,
    feeRate,
    privateKey,
  }: {
    to: string
    from: string
    amount: number
    feeRate?: number
    privateKey: string
  }) {
    const taprootUtxos = await this.getUtxosArtifacts({
      address: from,
    })

    if (!feeRate) {
      feeRate = (await this.esploraRpc.getFeeEstimates())['1']
    }

    const signer = new Signer(this.network, privateKey, 0)

    const { rawTxn } = await createTaprootBtcTx({
      inputAddress: from,
      outputAddress: to,
      amount: amount,
      feeRate: feeRate,
      privateKey: privateKey,
      network: this.network,
      taprootUtxos: taprootUtxos,
    })

    const { signedTxnId, signedRawTxn } = await signer.SignAllInputs({ rawTxn })

    const [result] =
      await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([
        signedRawTxn,
      ])

    if (!result.allowed) {
      throw new Error(result['reject-reason'])
    }

    await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(signedRawTxn)

    return { txnId: signedTxnId, rawTxn: signedRawTxn }
  }

  /**
   * Retrieves information about a SegWit address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The SegWit address to validate and get information for.
   * @returns {Promise<Object>} A promise that resolves to an object containing validity status and summary of the address.
   */
  async getSegwitAddressInfo({ address }) {
    const isValid = transactions.validateSegwitAddress({
      address,
      type: 'segwit',
    })
    if (!isValid) {
      return { isValid, summary: null }
    }
    const summary = await this.getAddressSummary({
      address,
    })
    return { isValid, summary }
  }

  /**
   * Retrieves information about a Taproot address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The Taproot address to validate and get information for.
   * @returns {Promise<Object>} A promise that resolves to an object containing validity status and summary of the address.
   */
  async getTaprootAddressInfo({ address }) {
    const isValid = transactions.validateTaprootAddress({
      address,
      type: 'taproot',
    })
    if (!isValid) {
      return { isValid, summary: null }
    }
    const summary = await this.getAddressSummary({
      address,
      includeInscriptions: false,
    })
    return { isValid, summary }
  }

  /**
   * Fetches offers associated with a specific BRC20 ticker.
   * @param {Object} params - The parameters containing the ticker information.
   * @param {string} params.ticker - The ticker symbol to retrieve offers for.
   * @returns {Promise<any>} A promise that resolves to an array of offers.
   */
  async getBrcOffers({ ticker }) {
    const offers = await this.apiClient.getOkxTickerOffers({ ticker: ticker })
    return offers
  }

  /**
   * Fetches aggregated offers associated with a specific BRC20 ticker.
   * @param {Object} params - The parameters containing the ticker information.
   * @param {string} params.ticker - The ticker symbol to retrieve offers for.
   * @param {}
   * @returns {Promise<any>} A promise that resolves to an array of offers.
   */
  async getAggregatedBrcOffers({
    ticker,
    limitOrderAmount,
    marketPrice,
  }: {
    ticker: string
    limitOrderAmount: number
    marketPrice: number
  }) {
    const testnet = this.network == getNetwork('testnet')
    const offers = await this.apiClient.getAggregatedOffers({
      ticker,
      limitOrderAmount,
      marketPrice,
      testnet,
    })
    return offers
  }

  /**
   * Lists BRC20 tokens associated with an address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The address to list BRC20 tokens for.
   * @returns {Promise<any>} A promise that resolves to an array of BRC20 tokens.
   */
  async listBrc20s({ address }: { address: string }) {
    const tokens = await this.apiClient.getBrc20sByAddress(address)
    for (let i = 0; i < tokens.data.length; i++) {
      const details = await this.apiClient.getBrc20TokenDetails(
        tokens.data[i].ticker
      )
      tokens.data[i]['details'] = details.data
    }
    return tokens
  }

  /**
   * Lists inscribed collectibles associated with an address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The address to list collectibles for.
   * @returns {Promise<any>} A promise that resolves to an array of collectibles.
   */
  async listCollectibles({ address }: { address: string }) {
    return await this.apiClient.getCollectiblesByAddress(address)
  }

  /**
   * Retrieves a specific inscribed collectible by its ID.
   * @param {string} inscriptionId - The ID of the collectible to retrieve.
   * @returns {Promise<any>} A promise that resolves to the collectible data.
   */
  async getCollectibleById(inscriptionId: string) {
    const data = await this.ordRpc.getInscriptionById(inscriptionId)
    return data as {
      address: string
      children: any[]
      content_length: number
      content_type: string
      genesis_fee: number
      genesis_height: number
      inscription_id: string
      inscription_number: number
      next: string
      output_value: number
      parent: any
      previous: string
      rune: any
      sat: number
      satpoint: string
      timestamp: number
    }
  }

  async signPsbt({
    psbtHex,
    publicKey,
    address,
    signer,
  }: {
    psbtHex: string
    publicKey: string
    address: string
    signer: HdKeyring['signTransaction']
  }) {
    const addressType = getAddressType(address)

    const tx = new OGPSBTTransaction(
      signer,
      address,
      publicKey,
      addressType,
      this.network
    )

    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network })

    const signedPsbt = await tx.signPsbt(psbt)

    return {
      psbtHex: signedPsbt.toHex(),
    }
  }

  async pushPsbt(psbtHex: string) {
    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network })
    const txId = psbt.extractTransaction().getId()
    const rawTx = psbt.extractTransaction().toHex()

    const [result] =
      await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([rawTx])

    if (!result.allowed) {
      throw new Error(result['reject-reason'])
    }

    await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(rawTx)

    return { txId }
  }

  async finalizePsbtBase64(psbtBase64) {
    try {
      const { hex: finalizedPsbtHex } = await this.sandshrewBtcClient._call(
        'btc_finalizepsbt',
        [`${psbtBase64}`]
      )

      return finalizedPsbtHex
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }
  async sendPsbt(txData: string, isDry?: boolean) {
    try {
      if (isDry) {
        const response = await this.sandshrewBtcClient._call(
          'btc_testmempoolaccept',
          [`${txData}`]
        )
        console.log({ response })
      } else {
        const { hex: txHex } = await this.sandshrewBtcClient._call(
          'btc_sendrawtransaction',
          [`${txData}`]
        )

        return {
          sentPsbt: txHex,
          sentPsbtBase64: Buffer.from(txHex, 'hex').toString('base64'),
        }
      }
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }

  async createSegwitSigner({
    mnemonic,
    segwitAddress,
    hdPathWithIndex,
  }: {
    mnemonic: string
    segwitAddress: string
    hdPathWithIndex: string
  }) {
    const segwitAddressType = transactions.getAddressType(segwitAddress)

    if (segwitAddressType == null) {
      throw Error('Unrecognized Address Type')
    }
    const segwitPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: segwitAddressType,
    })

    const segwitKeyring = segwitPayload.keyring.keyring
    const segwitSigner = segwitKeyring.signTransaction.bind(segwitKeyring)
    return segwitSigner
  }

  async createTaprootSigner({
    mnemonic,
    taprootAddress,
    hdPathWithIndex = customPaths['oyl']['taprootPath'],
  }: {
    mnemonic: string
    taprootAddress: string
    hdPathWithIndex?: string
  }) {
    const addressType = transactions.getAddressType(taprootAddress)
    if (addressType == null) {
      throw Error('Unrecognized Address Type')
    }

    const tapPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: addressType,
    })

    const tapKeyring = tapPayload.keyring.keyring

    const taprootSigner = tapKeyring.signTransaction.bind(tapKeyring)
    return taprootSigner
  }

  async createSigner({
    mnemonic,
    fromAddress,
    hdPathWithIndex,
  }: {
    mnemonic: string
    fromAddress: string
    hdPathWithIndex: string
  }) {
    const addressType = transactions.getAddressType(fromAddress)
    if (addressType == null) {
      throw Error('Unrecognized Address Type')
    }

    const tapPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: addressType,
    })

    const tapKeyring = tapPayload.keyring.keyring

    const taprootSigner = tapKeyring.signTransaction.bind(tapKeyring)
    return taprootSigner
  }

  async sendBRC20(options: {
    mnemonic: string
    fromAddress: string
    taprootPublicKey: string
    destinationAddress: string
    segwitHdPath: string
    segwitPubKey?: string
    segwitAddress?: string
    payFeesWithSegwit?: boolean
    feeRate?: number
    token?: string
    amount?: number
    postage?: number
    isDry?: boolean
    inscriptionId?: string
  }) {
    // await isDryDisclaimer(options.isDry)
    if (
      options.payFeesWithSegwit &&
      (!options.segwitAddress || !options.segwitPubKey)
    ) {
      throw new Error('Invalid segwit information entered')
    }
    try {
      const addressType = transactions.getAddressType(options.fromAddress)
      if (addressType == null) {
        throw new Error('Unrecognized Address Type')
      }

      const path = options.segwitHdPath ?? 'oyl'
      const hdPaths = customPaths[path]

      const taprootUtxos = await this.getUtxosArtifacts({
        address: options.fromAddress,
      })

      console.log({ taprootUtxosStr: JSON.stringify(taprootUtxos) })

      let segwitUtxos: any[] | undefined
      if (options.segwitAddress) {
        segwitUtxos = await this.getUtxosArtifacts({
          address: options.segwitAddress,
        })
      }

      const commitTxSize = calculateTaprootTxSize(3, 0, 2)
      const feeForCommit =
        commitTxSize * options.feeRate < 200
          ? 200
          : commitTxSize * options.feeRate

      const revealTxSize = calculateTaprootTxSize(1, 0, 1)
      const feeForReveal =
        revealTxSize * options.feeRate < 200
          ? 200
          : revealTxSize * options.feeRate

      const brcSendSize = calculateTaprootTxSize(2, 0, 2)
      const feeForBrcSend =
        brcSendSize * options.feeRate < 200
          ? 200
          : brcSendSize * options.feeRate

      const inscriptionSats = 546
      const amountNeededForInscribeAndSend =
        Number(feeForCommit) +
        Number(feeForReveal) +
        inscriptionSats +
        feeForBrcSend

      const amountGatheredForSend = calculateAmountGatheredUtxo(taprootUtxos)

      if (amountGatheredForSend < amountNeededForInscribeAndSend) {
        return { error: 'INSUFFICIENT FUNDS' }
      }

      let segwitSigner, segwitPrivateKey

      const taprootSigner = await this.createTaprootSigner({
        mnemonic: options.mnemonic,
        taprootAddress: options.fromAddress,
        hdPathWithIndex: hdPaths['taprootPath'],
      })
      const taprootPrivateKey = await this.fromPhrase({
        mnemonic: options.mnemonic,
        addrType: transactions.getAddressType(options.fromAddress),
        hdPath: hdPaths['taprootPath'],
      })

      if (options.segwitAddress) {
        segwitSigner = await this.createSegwitSigner({
          mnemonic: options.mnemonic,
          segwitAddress: options.segwitAddress,
          hdPathWithIndex: hdPaths['segwitPath'],
        })
        segwitPrivateKey = await this.fromPhrase({
          mnemonic: options.mnemonic,
          addrType: transactions.getAddressType(options.segwitAddress),
          hdPath: hdPaths['segwitPath'],
        })
      }

      let feeRate: number
      if (!options?.feeRate) {
        feeRate = (await this.esploraRpc.getFeeEstimates())['1']
      } else {
        feeRate = options.feeRate
      }

      const content = `{"p":"brc-20","op":"transfer","tick":"${options.token}","amt":"${options.amount}"}`

      const { txId, commitTx, revealTx } = await inscribe({
        content,
        inputAddress: options.fromAddress,
        outputAddress: options.destinationAddress,
        mnemonic: options.mnemonic,
        taprootPublicKey: options.taprootPublicKey,
        segwitPublicKey: options.segwitPubKey,
        segwitAddress: options.segwitAddress,
        isDry: options.isDry,
        payFeesWithSegwit: options.payFeesWithSegwit,
        segwitSigner: segwitSigner,
        taprootSigner: taprootSigner,
        feeRate: feeRate,
        network: this.currentNetwork,
        segwitUtxos: segwitUtxos,
        taprootUtxos: taprootUtxos,
        taprootPrivateKey:
          taprootPrivateKey.keyring.keyring._index2wallet[0][1].privateKey.toString(
            'hex'
          ),
        sandshrewBtcClient: this.sandshrewBtcClient,
        esploraRpc: this.esploraRpc,
      })

      const txResult = await waitForTransaction({
        txId,
        sandshrewBtcClient: this.sandshrewBtcClient,
      })
      if (!txResult) {
        throw new Error('ERROR WAITING FOR COMMIT TX')
      }

      const utxosForTransferSendFees = await this.getUtxosArtifacts({
        address: options.fromAddress,
      })

      const sendTxSize = calculateTaprootTxSize(3, 0, 2)
      const feeForSend = sendTxSize * feeRate < 200 ? 200 : sendTxSize * feeRate
      const utxosToSend = findUtxosToCoverAmount(
        utxosForTransferSendFees,
        feeForSend
      )
      const amountGathered = calculateAmountGatheredUtxo(
        utxosToSend.selectedUtxos
      )
      const sendPsbt = new bitcoin.Psbt({
        network: getNetwork(this.currentNetwork),
      })
      sendPsbt.addInput({
        hash: txId,
        index: 0,
        witnessUtxo: {
          script: Buffer.from(
            utxosToSend.selectedUtxos[0].scriptPk as string,
            'hex'
          ),
          value: 546,
        },
      })
      for await (const utxo of utxosToSend.selectedUtxos) {
        sendPsbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            script: Buffer.from(utxo.scriptPk, 'hex'),
            value: utxo.satoshis,
          },
        })
      }
      sendPsbt.addOutput({
        address: options.destinationAddress,
        value: 546,
      })
      const reimbursementAmount = amountGathered - feeForSend
      if (reimbursementAmount > 546) {
        sendPsbt.addOutput({
          address: options.fromAddress,
          value: amountGathered - feeForSend,
        })
      }
      const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
        _psbt: sendPsbt,
        pubkey: options.taprootPublicKey,
        segwitPubkey: options.segwitPubKey,
        segwitAddress: options.segwitAddress,
        taprootAddress: options.fromAddress,
        network: getNetwork(this.currentNetwork),
      })
      const signedSendPsbt = await signInputs(
        sendPsbt,
        toSignInputs,
        options.taprootPublicKey,
        options.segwitPubKey,
        segwitSigner,
        taprootSigner
      )
      signedSendPsbt.finalizeAllInputs()

      const sendTxHex = signedSendPsbt.extractTransaction().toHex()
      const sendTxId = signedSendPsbt.extractTransaction().getId()

      const [result] =
        await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([sendTxHex])

      if (!result.allowed) {
        throw new Error(result['reject-reason'])
      }

      await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(sendTxHex)

      return {
        txId: sendTxId,
        rawTxn: sendTxHex,
        sendBrc20Txids: [commitTx, revealTx, sendTxId],
      }
    } catch (err) {
      console.error(err)
      throw new Error(err)
    }
  }

  async sendOrdCollectible({
    mnemonic,
    fromAddress,
    taprootPublicKey,
    destinationAddress,
    segwitPubKey,
    segwitAddress,
    payFeesWithSegwit,
    feeRate,
    isDry,
    inscriptionId,
    segwitHdPath = 'oyl',
  }: {
    fromAddress: string
    taprootPublicKey: string
    destinationAddress: string
    segwitPubKey?: string
    segwitAddress?: string
    payFeesWithSegwit?: boolean
    isDry?: boolean
    feeRate?: number
    mnemonic: string
    segwitHdPath?: string
    inscriptionId: string
  }) {
    try {
      if (payFeesWithSegwit && (!segwitAddress || !segwitPubKey)) {
        throw new Error('Invalid segwit information entered')
      }
      const hdPaths = customPaths[segwitHdPath]

      const collectibleData = await this.getCollectibleById(inscriptionId)

      if (collectibleData.address !== fromAddress) {
        throw new Error('Inscription does not belong to fromAddress')
      }

      const inscriptionTxId = collectibleData.satpoint.split(':')[0]
      const inscriptionTxVOutIndex = collectibleData.satpoint.split(':')[1]
      const inscriptionUtxoDetails = await this.esploraRpc.getTxInfo(
        inscriptionTxId
      )
      const inscriptionUtxoData =
        inscriptionUtxoDetails.vout[inscriptionTxVOutIndex]

      const isSpentArray = await this.esploraRpc.getTxOutspends(inscriptionTxId)
      const isSpent = isSpentArray[inscriptionTxVOutIndex]
      if (isSpent.spent) {
        throw new Error('Inscription is missing')
      }

      const taprootSigner = await this.createTaprootSigner({
        mnemonic: mnemonic,
        taprootAddress: fromAddress,
        hdPathWithIndex: hdPaths['taprootPath'],
      })

      let segwitSigner
      if (segwitAddress) {
        segwitSigner = await this.createSegwitSigner({
          mnemonic: mnemonic,
          segwitAddress: segwitAddress,
          hdPathWithIndex: hdPaths['segwitPath'],
        })
      }

      if (!feeRate) {
        feeRate = (await this.esploraRpc.getFeeEstimates())['1']
      }

      const utxosForTransferSendFees = await this.getUtxosArtifacts({
        address: fromAddress,
      })
      const sendTxSize = calculateTaprootTxSize(3, 0, 2)
      const feeForSend = sendTxSize * feeRate < 200 ? 200 : sendTxSize * feeRate
      const utxosToSend = findUtxosToCoverAmount(
        utxosForTransferSendFees,
        feeForSend
      )
      const amountGathered = calculateAmountGatheredUtxo(
        utxosToSend.selectedUtxos
      )
      const sendPsbt = new bitcoin.Psbt({
        network: getNetwork(this.currentNetwork),
      })

      sendPsbt.addInput({
        hash: inscriptionTxId,
        index: parseInt(inscriptionTxVOutIndex),
        witnessUtxo: {
          script: Buffer.from(
            utxosToSend.selectedUtxos[0].scriptPk as string,
            'hex'
          ),
          value: inscriptionUtxoData.value,
        },
      })

      for await (const utxo of utxosToSend.selectedUtxos) {
        sendPsbt.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            script: Buffer.from(utxo.scriptPk, 'hex'),
            value: utxo.satoshis,
          },
        })
      }
      sendPsbt.addOutput({
        address: destinationAddress,
        value: inscriptionUtxoData.value,
      })
      const reimbursementAmount = amountGathered - feeForSend
      if (reimbursementAmount > 546) {
        sendPsbt.addOutput({
          address: fromAddress,
          value: amountGathered - feeForSend,
        })
      }

      const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
        _psbt: sendPsbt,
        pubkey: taprootPublicKey,
        segwitPubkey: segwitPubKey,
        segwitAddress: segwitAddress,
        taprootAddress: fromAddress,
        network: getNetwork(this.currentNetwork),
      })
      const signedSendPsbt = await signInputs(
        sendPsbt,
        toSignInputs,
        taprootPublicKey,
        segwitPubKey,
        segwitSigner,
        taprootSigner
      )
      signedSendPsbt.finalizeAllInputs()

      const sendTxHex = signedSendPsbt.extractTransaction().toHex()
      const sendTxId = signedSendPsbt.extractTransaction().getId()

      if (isDry) {
        return { txId: sendTxId, rawTxn: sendTxHex }
      }

      const [result] =
        await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([sendTxHex])

      if (!result.allowed) {
        throw new Error(result['reject-reason'])
      }

      await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(sendTxHex)

      return { txId: sendTxId, rawTxn: sendTxHex }
    } catch (error) {
      console.error(error)
      throw new Error(error)
    }
  }
}

const isDryDisclaimer = async (isDry: boolean) => {
  if (isDry) {
    console.log('DRY!!!!! RUNNING METHOD IN DRY MODE')
  } else {
    console.log('WET!!!!!!! 5')
    await delay(1000)
    console.log('WET!!!!!!! 4')
    await delay(1000)
    console.log('WET!!!!!!! 3')
    await delay(1000)
    console.log('WET!!!!!!! 2')
    await delay(1000)
    console.log('WET!!!!!!! 1')
    await delay(1000)
    console.log('LAUNCH!')
    await delay(1000)
  }
}
