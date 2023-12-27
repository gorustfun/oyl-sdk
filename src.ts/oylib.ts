import { UTXO_DUST, defaultNetworkOptions } from './shared/constants'

import { PSBTTransaction } from './txbuilder'

import {
  delay,
  inscribe,
  sendCollectible,
  createBtcTx,
  getNetwork,
} from './shared/utils'
import BcoinRpc from './rpclient'
import { SandshrewBitcoinClient } from './rpclient/sandshrew'
import { EsploraRpc } from './rpclient/esplora'
import * as transactions from './transactions'
import { publicKeyToAddress } from './wallet/accounts'
import { accounts } from './wallet'
import { AccountManager, customPaths } from './wallet/accountsManager'

import {
  AddressType,
  InscribeTransfer,
  NetworkOptions,
  ProviderOptions,
  Providers,
  RecoverAccountOptions,
  TickerDetails,
} from './shared/interface'
import { OylApiClient } from './apiclient'
import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from './rpclient/provider'
import { OrdRpc } from './rpclient/ord'

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
  public rpcClient: BcoinRpc
  public apiClient: OylApiClient
  public derivPath: String

  /**
   * Initializes a new instance of the Wallet class.
   */
  constructor(options: NetworkOptions = defaultNetworkOptions) {
    this.apiClient = new OylApiClient({ host: 'https://api.oyl.gg' })
    const rpcUrl = `${options.baseUrl}/${options.version}/${options.projectId}`
    const provider = new Provider(rpcUrl)
    this.network = getNetwork(options.network)
    this.sandshrewBtcClient = provider.sandshrew
    this.esploraRpc = provider.esplora
    this.ordRpc = provider.ord
    this.fromProvider()
    this.wallet = this.createWallet({})
  }

  /**
   * Connects to a given blockchain RPC client.
   * @param {BcoinRpc} provider - The blockchain RPC client to connect to.
   * @returns {Wallet} - The connected wallet instance.
   */
  static connect(provider: BcoinRpc) {
    try {
      const wallet = new this()
      wallet.rpcClient = provider
      return wallet
    } catch (e) {
      throw Error('An error occured: ' + e)
    }
  }

  /**
   * Configures the wallet class with a provider from the given options.
   * @param {ProviderOptions} [options] - The options to configure the provider.
   * @returns {ProviderOptions} The applied client options.
   */
  fromProvider(options?: ProviderOptions) {
    try {
      const clientOptions = {}
      clientOptions['network'] = options?.network || 'main'
      clientOptions['port'] = options?.port || 8332
      clientOptions['host'] = options?.host || '172.31.17.134'
      clientOptions['apiKey'] = options?.auth || 'oylwell'

      switch (options?.provider) {
        case Providers.bcoin:
          this.rpcClient = new BcoinRpc(clientOptions)
        default:
          this.rpcClient = new BcoinRpc(clientOptions)
      }
      return clientOptions
    } catch (e) {
      throw Error('An error occured: ' + e)
    }
  }

  /**
   * Gets a summary of the given address(es).
   * @param {string | string[]} address - A single address or an array of addresses.
   * @returns {Promise<Object[]>} A promise that resolves to an array of address summaries.
   */
  async getAddressSummary({ address }) {
    if (typeof address === 'string') {
      address = [address]
    }
    const addressesUtxo = []
    for (let i = 0; i < address.length; i++) {
      let utxos = await transactions.getUnspentOutputs(address[i])
      addressesUtxo[i] = {}
      addressesUtxo[i]['utxo'] = utxos.unspent_outputs
      addressesUtxo[i]['balance'] = transactions.calculateBalance(
        utxos.unspent_outputs
      )
    }
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
      const meta = await this.getUtxosArtifacts({ address: wallet['address'] })
      const data = {
        keyring: wallet,
        assets: meta,
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
  async recoverWallet(options: RecoverAccountOptions) {
    try {
      const wallet = new AccountManager(options)
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
  async addAccountToWallet(options: RecoverAccountOptions) {
    try {
      const wallet = new AccountManager(options)
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
      const wallet = new AccountManager({ network: this.network })
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
  async getMetaBalance({ address }) {
    const addressSummary = await this.getAddressSummary({ address })
    const confirmAmount = addressSummary.reduce((total, addr) => {
      const confirmedUtxos = addr.utxo.filter((utxo) => utxo.confirmations > 0)
      return (
        total + confirmedUtxos.reduce((sum, utxo) => sum + utxo.value / 1e8, 0)
      )
    }, 0)

    const pendingAmount = addressSummary.reduce((total, addr) => {
      const unconfirmedUtxos = addr.utxo.filter(
        (utxo) => utxo.confirmations === 0
      )
      return (
        total +
        unconfirmedUtxos.reduce((sum, utxo) => sum + utxo.value / 1e8, 0)
      )
    }, 0)

    const amount = confirmAmount + pendingAmount

    const usdValue = await transactions.convertUsdValue(amount)

    const response = {
      confirm_amount: confirmAmount.toFixed(8),
      pending_amount: pendingAmount.toFixed(8),
      amount: amount.toFixed(8),
      usd_value: usdValue,
    }

    return response
  }

  /**
   * Calculates the total value from previous outputs for the given inputs of a transaction.
   * @param {any[]} inputs - The inputs of a transaction which might be missing value information.
   * @param {string} address - The address to filter the inputs.
   * @returns {Promise<number>} A promise that resolves to the total value of the provided inputs.
   * @throws {Error} Throws an error if it fails to retrieve previous transaction data.
   */
  async getTxValueFromPrevOut(inputs: any[], address: string): Promise<number> {
    let totalMissingValue = 0
    for (const input of inputs) {
      if (!input.coin && input.address === address) {
        try {
          const prevTx = await this.apiClient.getTxByHash(input.prevout.hash)
          const output = prevTx.outputs[input.prevout.index]
          if (output && output.value) {
            totalMissingValue += output.value
          }
        } catch (error) {
          throw Error(`Error retrieving transaction`)
        }
      }
    }
    return totalMissingValue
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
        const blockDelta = currentBlock - status.block_height
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
    }
  }
  /******************************* */

  /**
   * Retrieves the fee rates for transactions from the mempool.
   * @returns {Promise<{ High: number; Medium: number; Low: number }>} A promise that resolves with an object containing the fee rates for High, Medium, and Low priority transactions.
   */
  async getFees(): Promise<{ High: number; Medium: number; Low: number }> {
    return await this.apiClient.getFees()
  }

  async getTotalBalance({ batch }) {
    const res = await this.getAddressSummary({ address: batch })
    let total = 0
    res.forEach((element) => {
      total += element.balance
    })

    return total
  }

  /**
   * Retrieves a list of inscriptions for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for inscriptions.
   * @returns {Promise<Array<any>>} A promise that resolves to an array of inscription details.
   */
  async getInscriptions({ address }) {
    const artifacts = await this.apiClient.getCollectiblesByAddress(address)
    return artifacts.data.map((item) => {
      const { inscription_id, inscription_number, satpoint } = item

      const detail = {
        id: inscription_id,
        address: item.owner_wallet_addr,
        preview: `https://ordinals.com/preview/${inscription_id}`,
        content: `https://ordinals.com/content/${inscription_id}`,
        location: satpoint,
      }

      return {
        id: inscription_id,
        inscription_number,
        detail,
      }
    })
  }

  /**
   * Retrieves UTXO artifacts for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for UTXO artifacts.
   * @returns A promise that resolves to the UTXO artifacts.
   */
  async getUtxosArtifacts({ address }) {
    const utxos = await transactions.getUnspentOutputs(address)
    const inscriptions = await this.getInscriptions({ address })
    const utxoArtifacts = await transactions.getMetaUtxos(
      address,
      utxos.unspent_outputs,
      inscriptions
    )
    return utxoArtifacts
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
    segwitHdPathWithIndex,
    taprootHdPathWithIndex,
    payFeesWithSegwit = true,
  }: {
    to: string
    from: string
    amount: number
    feeRate: number
    publicKey: string
    mnemonic: string
    segwitAddress?: string
    segwitPubkey?: string
    segwitHdPathWithIndex: string
    taprootHdPathWithIndex: string
    payFeesWithSegwit?: boolean
  }) {
    const hdPaths = customPaths[segwitHdPathWithIndex]
    const taprootSigner = await this.createTaprootSigner({
      mnemonic: mnemonic,
      taprootAddress: from,
      hdPathWithIndex: hdPaths['taprootPath'],
    })

    const segwitSigner = await this.createSegwitSigner({
      mnemonic: mnemonic,
      segwitAddress: segwitAddress,
      hdPathWithIndex: hdPaths['segwitPath'],
    })

    const taprootUtxos = await this.getUtxosArtifacts({
      address: from,
    })
    let segwitUtxos: any[] | undefined
    if (segwitAddress) {
      segwitUtxos = await this.getUtxosArtifacts({
        address: segwitAddress,
      })
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
    const summary = await this.getAddressSummary({ address })
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
      type: 'segwit',
    })
    if (!isValid) {
      return { isValid, summary: null }
    }
    const summary = await this.getAddressSummary({ address })
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
   * Lists BRC20 tokens associated with an address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The address to list BRC20 tokens for.
   * @returns {Promise<any>} A promise that resolves to an array of BRC20 tokens.
   */
  async listBrc20s({ address }: { address: string }) {
    return await this.apiClient.getBrc20sByAddress(address)
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
    const { data } = await this.apiClient.getCollectiblesById(inscriptionId)
    return data
  }

  async signPsbt(
    psbtHex: string,
    fee: any,
    pubKey: any,
    signer: any,
    address: string
  ) {
    try {
      const addressType = transactions.getAddressType(address)
      if (addressType == null) throw Error('Invalid Address Type')
      const tx = new PSBTTransaction(signer, address, pubKey, addressType, fee)
      const psbt = bitcoin.Psbt.fromHex(psbtHex)
      const signedPsbt = await tx.signPsbt(psbt)
      const signedPsbtBase64 = signedPsbt.toBase64()
      const signedPsbtHex = signedPsbt.toHex()
      return {
        signedPsbtHex: signedPsbtHex,
        signedPsbtBase64: signedPsbtBase64,
      }
    } catch (e) {
      console.log(e)
    }
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
      return ''
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
      }

      return {
        signedPsbtHex: '',
        signedPsbtBase64: '',
      }
    } catch (e) {
      console.log(e)
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
    if (segwitAddress) {
      let payload: any
      const segwitAddressType = transactions.getAddressType(segwitAddress)
      if (segwitAddressType == null) {
        throw Error('Unrecognized Address Type')
      }
      payload = await this.fromPhrase({
        mnemonic: mnemonic.trim(),
        hdPath: hdPathWithIndex,
        addrType: segwitAddressType,
      })
      const segwitKeyring = payload.keyring.keyring
      const segwitSigner = segwitKeyring.signTransaction.bind(segwitKeyring)
      return segwitSigner
    }
    return undefined
  }

  async createTaprootSigner({
    mnemonic,
    taprootAddress,
    hdPathWithIndex,
  }: {
    mnemonic: string
    taprootAddress: string
    hdPathWithIndex: string
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

  async signInscriptionPsbt(psbt, fee, pubKey, signer, address = '') {
    //INITIALIZE NEW PSBTTransaction INSTANCE
    const wallet = new Oyl()
    const addressType = transactions.getAddressType(address)
    if (addressType == null) throw Error('Invalid Address Type')
    const tx = new PSBTTransaction(signer, address, pubKey, addressType, fee)

    //SIGN AND FINALIZE THE PSBT
    const signedPsbt = await tx.signPsbt(psbt)
    signedPsbt.finalizeAllInputs()
    //@ts-ignore
    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false

    //EXTRACT THE RAW TX
    const rawtx = signedPsbt.extractTransaction().toHex()

    //BROADCAST THE RAW TX TO THE NETWORK
    const result = await wallet.apiClient.pushTx({ transactionHex: rawtx })
    //GET THE TX_HASH
    const ready_txId = psbt.extractTransaction().getId()
    //CONFIRM TRANSACTION IS CONFIRMED

    return ready_txId
  }

  async sendBRC20(options: InscribeTransfer) {
    await isDryDisclaimer(options.isDry)
    const hdPaths = customPaths[options.segwitHdPath]

    const taprootUtxos = await this.getUtxosArtifacts({
      address: options.fromAddress,
    })
    let segwitUtxos: any[] | undefined
    if (options.segwitAddress) {
      segwitUtxos = await this.getUtxosArtifacts({
        address: options.segwitAddress,
      })
    }

    const taprootSigner = await this.createTaprootSigner({
      mnemonic: options.mnemonic,
      taprootAddress: options.fromAddress,
      hdPathWithIndex: hdPaths['taprootPath'],
    })

    const segwitSigner = await this.createSegwitSigner({
      mnemonic: options.mnemonic,
      segwitAddress: options.segwitAddress,
      hdPathWithIndex: hdPaths['segwitPath'],
    })
    try {
      // CREATE TRANSFER INSCRIPTION
      return await inscribe({
        ticker: options.token,
        amount: options.amount,
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
        feeRate: options.feeRate,
        network: this.network,
        segwitUtxos: segwitUtxos,
        taprootUtxos: taprootUtxos,
      })
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(err)
        return Error(`Things exploded (${err.message})`)
      }
      console.error(err)
      return err
    }
  }

  async sendOrdCollectible(options: InscribeTransfer) {
    await isDryDisclaimer(options.isDry)
    const hdPaths = customPaths[options.segwitHdPath]
    try {
      const taprootUtxos: any[] = await this.getUtxosArtifacts({
        address: options.fromAddress,
      })
      let segwitUtxos: any[] | undefined
      if (options.segwitAddress) {
        segwitUtxos = await this.getUtxosArtifacts({
          address: options.segwitAddress,
        })
      }

      const { data: collectibleData } =
        await this.apiClient.getCollectiblesById(options.inscriptionId)

      const metaOffset = collectibleData.satpoint.charAt(
        collectibleData.satpoint.length - 1
      )

      const metaOutputValue = collectibleData.output_value || 10000

      const minOrdOutputValue = Math.max(metaOffset, UTXO_DUST)
      if (metaOutputValue < minOrdOutputValue) {
        throw Error(`OutputValue must be at least ${minOrdOutputValue}`)
      }

      const taprootSigner = await this.createTaprootSigner({
        mnemonic: options.mnemonic,
        taprootAddress: options.fromAddress,
        hdPathWithIndex: hdPaths['taprootPath'],
      })

      const segwitSigner = await this.createSegwitSigner({
        mnemonic: options.mnemonic,
        segwitAddress: options.segwitAddress,
        hdPathWithIndex: hdPaths['segwitPath'],
      })

      return await sendCollectible({
        inscriptionId: options.inscriptionId,
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
        feeRate: options.feeRate,
        network: this.network,
        taprootUtxos: taprootUtxos,
        segwitUtxos: segwitUtxos,
        metaOutputValue: metaOutputValue,
      })
    } catch (error) {
      console.log(error)
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
