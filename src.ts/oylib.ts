import { PSBTTransaction, buildOrdTx } from './txbuilder'
import { UTXO_DUST } from './shared/constants'
import { amountToSatoshis, satoshisToAmount } from './shared/utils'
import BcoinRpc from './rpclient'
import * as transactions from './transactions'
import { publicKeyToAddress } from './wallet/accounts'
import { bord, accounts } from './wallet'
import { HDKeyringOption, HdKeyring } from './wallet/hdKeyring'
import {
  AddressType,
  SwapBrc,
  ProviderOptions,
  Providers,
} from './shared/interface'
import { OylApiClient } from './apiclient'
import * as bitcoin from 'bitcoinjs-lib'

const RequiredPath = [
  "m/44'/0'/0'/0", // P2PKH (Legacy)
  "m/49'/0'/0'/0", // P2SH-P2WPKH (Nested SegWit)
  "m/84'/0'/0'/0", // P2WPKH (SegWit)
  "m/86'/0'/0'/0", // P2TR (Taproot)
]

export class Wallet {
  private mnemonic: String
  private wallet

  public provider: Providers
  public rpcClient: BcoinRpc
  public apiClient: OylApiClient
  public derivPath: String

  constructor() {
    this.apiClient = new OylApiClient({ host: 'https://api.oyl.gg' })
    this.fromProvider()
    //create wallet should optionally take in a private key
    this.wallet = this.createWallet({})
  }

  static connect(provider: BcoinRpc) {
    try {
      const wallet = new this()
      wallet.rpcClient = provider
      return wallet
    } catch (e) {
      throw Error('An error occured: ' + e)
    }
  }

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

  async getAddressSummary({ address }) {
    if (typeof address === 'string') {
      address = [address]
    }
    const addressesUtxo = []
    for (let i = 0; i < address.length; i++) {
      let utxos = await transactions.getUnspentOutputs(address[i])
      //console.log(utxos)
      addressesUtxo[i] = {}
      addressesUtxo[i]['utxo'] = utxos.unspent_outputs
      addressesUtxo[i]['balance'] = transactions.calculateBalance(
        utxos.unspent_outputs
      )
    }
    return addressesUtxo
  }

  async getTaprootAddress({ publicKey }) {
    try {
      const address = publicKeyToAddress(publicKey, AddressType.P2TR)
      return address
    } catch (err) {
      return err
    }
  }

  async fromPhrase({ mnemonic, type = 'taproot', hdPath = RequiredPath[3] }) {
    try {
      let addrType

      switch (type) {
        case 'taproot':
          addrType = AddressType.P2TR
          break
        case 'segwit':
          addrType = AddressType.P2WPKH
          break
        case 'legacy':
          addrType = AddressType.P2PKH
          break
        default:
          addrType = AddressType.P2TR
          break
      }

      const wallet = await accounts.importMnemonic(mnemonic, hdPath, addrType)
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

  async recoverWallet(options: HDKeyringOption) {
    try {
      const keyring = new HdKeyring(options)
      //keyring.addAccounts(2)
      return keyring
    } catch (error) {
      return error
    }
  }

  async getSegwitAddress({ publicKey }) {
    const address = publicKeyToAddress(publicKey, AddressType.P2WPKH)
    return address
  }

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

      const wallet = accounts.createWallet(hdPath, addrType)
      return wallet
    } catch (err) {
      return err
    }
  }

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

  async getTxHistory({ address }) {
    const history = await this.apiClient.getTxByAddress(address)
    const processedTransactions = history
      .map((tx) => {
        const { hash, height, time, outputs, inputs, confirmations, fee } = tx

        const output = outputs.find((output) => output.address === address)
        const input = inputs.find((input) => input.coin.address === address)
        const txDetails = {}
        txDetails['hash'] = hash
        txDetails['confirmations'] = confirmations
        txDetails['blocktime'] = time
        txDetails['blockheight'] = height
        if (input) {
          txDetails['type'] = 'sent'
          txDetails['fee'] = fee
          txDetails['feeRate'] = fee / 140
          txDetails['to'] = outputs.find(
            (output) => output.address != address
          )?.address
          if (output) {
            txDetails['amount'] = input.coin.value / 1e8 - output.value / 1e8
          } else {
            txDetails['amount'] = input.coin.value / 1e8
          }
        } else {
          if (output) {
            txDetails['type'] = 'received'
            txDetails['amount'] = output.value / 1e8
            txDetails['fee'] = fee
            txDetails['feeRate'] = fee / 140
            txDetails['from'] = inputs.find(
              (input) => input.coin.address != address
            ).coin.address
          }
        }
        txDetails['symbol'] = 'BTC'
        return txDetails
      })
      .filter((transaction) => transaction !== null) // Filter out null transactions

    return processedTransactions
  }

  async getFees(): Promise<{ High: number; Medium: number; Low: number }> {
    return await this.apiClient.getFees()
  }

  // async getActiveAddresses({ xpub, lookAhead = 10 }) {
  //   const childKeyB58 = bip32.fromBase58(xpub)
  //   const chain = new Chain(childKeyB58)
  //   const batch = [chain.get()] //get first at index 0
  //   let seenUnused = false

  //   //Check through each Address to see which one has been used
  //   while (batch.length < lookAhead && seenUnused === false) {
  //     chain.next()
  //     batch.push(chain.get())
  //     const res = await this.getAddressSummary({ address: batch })
  //     res.map(function (res) {
  //       if (res.balance > 0) {
  //         seenUnused = true
  //       }
  //     })
  //   }

  //   return batch
  // }

  async getTotalBalance({ batch }) {
    const res = await this.getAddressSummary({ address: batch })
    let total = 0
    res.forEach((element) => {
      total += element.balance
    })

    return total
  }

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

  async importWatchOnlyAddress({ addresses = [] }) {
    for (let i = 0; i < addresses.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10000))
      await this.rpcClient.execute('importaddress', [addresses[i], '', true])
    }
  }

  /**
  * 
  * Example implementation to send BTC DO NOT USE!!!

  async sendBtc({ mnemonic, to, amount, fee }) {

  const payload = await this.fromPhrase({
    mnemonic: mnemonic.trim(),
    hdPath: "m/49'/0'/0'",
    type: 'segwit',
  })

  const keyring = payload.keyring.keyring;
  const pubKey = keyring.wallets[0].publicKey.toString('hex');
  const signer = keyring.signTransaction.bind(keyring);
  const from = payload.keyring.address;
  const changeAddress = from;


  return await this.createPsbtTx({publicKey: pubKey, from: from, to: to, changeAddress: changeAddress, amount: amount, fee: fee,  signer: signer })
  }
*/

  /**
  * 
  * Example implementation to send Ordinal DO NOT USE!!!

async sendOrd({ mnemonic, to,  inscriptionId, inscriptionOffset, inscriptionOutputValue, fee }) {
  const payload = await this.fromPhrase({
    mnemonic: mnemonic.trim(),
    hdPath: "m/49'/0'/0'",
    type: 'segwit',
  })
  const keyring = payload.keyring.keyring;
  const pubKey = keyring.wallets[0].publicKey.toString('hex');
  const signer = keyring.signTransaction.bind(keyring);
  const from = payload.keyring.address;
  const changeAddress = from; 
  return await this.createOrdPsbtTx({ 
    publicKey: pubKey, 
    fromAddress: from, 
    toAddress: to, 
    changeAddress: changeAddress, 
    txFee: fee, 
    signer: signer, 
    inscriptionId, 
    metaOffset: inscriptionOffset, 
    metaOutputValue: inscriptionOutputValue 
  })
}
*/

  async createOrdPsbtTx({
    publicKey,
    fromAddress,
    toAddress,
    changeAddress,
    txFee,
    signer,
    inscriptionId,
  }: {
    publicKey: string
    fromAddress: string
    toAddress: string
    changeAddress: string
    txFee: number
    signer: any
    inscriptionId: string
  }) {
    const { data: collectibleData } = await this.apiClient.getCollectiblesById(
      inscriptionId
    )

    const metaOffset = collectibleData.satpoint.charAt(
      collectibleData.satpoint.length - 1
    )

    const metaOutputValue = collectibleData.output_value || 10000

    const minOrdOutputValue = Math.max(metaOffset, UTXO_DUST)
    if (metaOutputValue < minOrdOutputValue) {
      throw Error(`OutputValue must be at least ${minOrdOutputValue}`)
    }

    const allUtxos = await this.getUtxosArtifacts({ address: fromAddress })
    const feeRate = txFee
    const addressType = transactions.getAddressType(fromAddress)
    if (addressType == null) throw Error('Unrecognized Address Type')

    const psbtTx = new PSBTTransaction(
      signer,
      fromAddress,
      publicKey,
      addressType,
      feeRate
    )
    psbtTx.setChangeAddress(changeAddress)
    const finalizedPsbt = await buildOrdTx(
      psbtTx,
      allUtxos,
      toAddress,
      metaOutputValue,
      inscriptionId
    )

    //@ts-ignore
    finalizedPsbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false

    const rawtx = finalizedPsbt.extractTransaction().toHex()
    const result = await this.apiClient.pushTx({ transactionHex: rawtx })

    return {
      txId: finalizedPsbt.extractTransaction().getId(),
      ...result,
    }
  }

  async createPsbtTx({
    publicKey,
    from,
    to,
    changeAddress,
    amount,
    fee,
    signer,
  }: {
    publicKey: string
    from: string
    to: string
    changeAddress: string
    amount: string
    fee: number
    signer: any
  }) {
    const utxos = await this.getUtxosArtifacts({ address: from })
    const feeRate = fee
    const addressType = transactions.getAddressType(from)
    if (addressType == null) throw Error('Invalid Address Type')

    const tx = new PSBTTransaction(
      signer,
      from,
      publicKey,
      addressType,
      feeRate
    )

    tx.addOutput(to, amountToSatoshis(amount))
    tx.setChangeAddress(changeAddress)
    const outputAmount = tx.getTotalOutput()

    const nonOrdUtxos = []
    const ordUtxos = []
    utxos.forEach((v) => {
      if (v.inscriptions.length > 0) {
        ordUtxos.push(v)
      } else {
        nonOrdUtxos.push(v)
      }
    })

    let tmpSum = tx.getTotalInput()
    for (let i = 0; i < nonOrdUtxos.length; i++) {
      const nonOrdUtxo = nonOrdUtxos[i]
      if (tmpSum < outputAmount) {
        tx.addInput(nonOrdUtxo)
        tmpSum += nonOrdUtxo.satoshis
        continue
      }

      const fee = await tx.calNetworkFee()
      if (tmpSum < outputAmount + fee) {
        tx.addInput(nonOrdUtxo)
        tmpSum += nonOrdUtxo.satoshis
      } else {
        break
      }
    }

    if (nonOrdUtxos.length === 0) {
      throw new Error('Balance not enough')
    }

    const totalUnspentAmount = tx.getUnspent()
    if (totalUnspentAmount === 0) {
      throw new Error('Balance not enough to pay network fee.')
    }

    // add dummy output
    tx.addChangeOutput(1)

    const estimatedNetworkFee = await tx.calNetworkFee()
    if (totalUnspentAmount < estimatedNetworkFee) {
      throw new Error(
        `Not enough balance. Need ${satoshisToAmount(
          estimatedNetworkFee
        )} BTC as network fee, but only ${satoshisToAmount(
          totalUnspentAmount
        )} BTC is available.`
      )
    }

    const remainingBalance = totalUnspentAmount - estimatedNetworkFee
    if (remainingBalance >= UTXO_DUST) {
      // change dummy output to true output
      tx.getChangeOutput().value = remainingBalance
    } else {
      // remove dummy output
      tx.removeChangeOutput()
    }

    const psbt = await tx.createSignedPsbt()
    tx.dumpTx(psbt)

    //@ts-ignore
    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false

    const rawtx = psbt.extractTransaction().toHex()
    // console.log("rawtx", rawtx)
    const result = await this.apiClient.pushTx({ transactionHex: rawtx })
    // console.log(result)

    return {
      txId: psbt.extractTransaction().getId(),
      ...result,
    }
  }

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

  async getBrcOffers({ ticker }) {
    const offers = await this.apiClient.getTickerOffers({ _ticker: ticker })
    return offers
  }

  async swapBrc(bid: SwapBrc) {
    const psbt = await this.apiClient.initSwapBid({
      address: bid.address,
      auctionId: bid.auctionId,
      bidPrice: bid.bidPrice,
      pubKey: bid.pubKey,
    })
    if (psbt.error) return psbt
    const unsignedPsbt = psbt.psbtBid
    const feeRate = psbt.feeRate

    const swapOptions = bid
    swapOptions['psbt'] = unsignedPsbt
    swapOptions['feeRate'] = feeRate

    const signedPsbt = await this.swapFlow(swapOptions)

    const txId = await this.apiClient.submitSignedBid({
      psbtBid: signedPsbt,
      auctionId: bid.auctionId,
      bidId: psbt.bidId,
    })

    return txId
  }

  async swapFlow(options) {
    const address = options.address
    const feeRate = options.feeRate
    const mnemonic = options.mnemonic
    const pubKey = options.pubKey

    const psbt = bitcoin.Psbt.fromHex(options.psbt, {
      network: bitcoin.networks.bitcoin,
    })
    const wallet = new Wallet()
    const payload = await wallet.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: options.hdPath,
      type: options.type,
    })

    const keyring = payload.keyring.keyring
    const signer = keyring.signTransaction.bind(keyring)
    const from = address
    const addressType = transactions.getAddressType(from)
    if (addressType == null) throw Error('Invalid Address Type')

    const tx = new PSBTTransaction(signer, from, pubKey, addressType, feeRate)

    const psbt_ = await tx.signPsbt(psbt, false)

    return psbt_.toHex()
  }

  async listBrc20s({ address }: { address: string }) {
    return await this.apiClient.getBrc20sByAddress(address)
  }

  async listCollectibles({ address }: { address: string }) {
    return await this.apiClient.getCollectiblesByAddress(address)
  }
}
