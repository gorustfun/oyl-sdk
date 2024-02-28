import * as bitcoin from 'bitcoinjs-lib'
import ECPairFactory from 'ecpair'
import ecc from '@bitcoinerlab/secp256k1'
import {
  AddressType,
  addressTypeToName,
  BitcoinPaymentType,
  IBlockchainInfoUTXO,
  Network,
  ToSignInput,
  TxInput,
  UnspentOutput,
} from '../shared/interface'
import BigNumber from 'bignumber.js'
import { maximumScriptBytes } from './constants'
import axios from 'axios'
import { getAddressType } from '../transactions'
import { Address, Signer, Tap, Tx } from '@cmdcode/tapscript'
import * as ecc2 from '@cmdcode/crypto-utils'
import {
  addInscriptionUtxo,
  findUtxosToCoverAmount,
  getUtxosForFees,
  Utxo,
} from '../txbuilder/buildOrdTx'
import { isTaprootInput } from 'bitcoinjs-lib/src/psbt/bip371'
import { SandshrewBitcoinClient } from '../rpclient/sandshrew'
import { EsploraRpc } from '../rpclient/esplora'

bitcoin.initEccLib(ecc)

export interface IBISWalletIx {
  validity: any
  isBrc: boolean
  isSns: boolean
  name: any
  amount: any
  isValidTransfer: any
  operation: any
  ticker: any
  isJson: boolean
  content?: string
  inscription_name: any
  inscription_id: string
  inscription_number: number
  metadata: any
  owner_wallet_addr: string
  mime_type: string
  last_sale_price: any
  slug: any
  collection_name: any
  content_url: string
  bis_url: string

  wallet?: string
  media_length?: number
  genesis_ts?: number
  genesis_height?: number
  genesis_fee?: number
  output_value?: number
  satpoint?: string
  collection_slug?: string
  confirmations?: number
}

const addressTypeMap = { 1: 'p2pkh', 2: 'p2sh', 3: 'p2wpkh', 4: 'p2tr' }

export const ECPair = ECPairFactory(ecc)

export const assertHex = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33)

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  )
}

export function getNetwork(
  value: Network | 'main' | 'mainnet' | 'regtest' | 'testnet'
) {
  if (value === 'mainnet' || value === 'main') {
    return bitcoin.networks['bitcoin']
  }

  return bitcoin.networks[value]
}

export function checkPaymentType(
  payment: bitcoin.PaymentCreator,
  network: Network
) {
  return (script: Buffer) => {
    try {
      return payment({ output: script, network: getNetwork(network) })
    } catch (error) {
      return false
    }
  }
}

export function tweakSigner(
  signer: bitcoin.Signer,
  opts: any = {}
): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!
  if (!privateKey) {
    throw new Error('Private key required')
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey)
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(assertHex(signer.publicKey), opts.tweakHash)
  )
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!')
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  })
}

export function satoshisToAmount(val: number) {
  const num = new BigNumber(val)
  return num.dividedBy(100000000).toFixed(8)
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function amountToSatoshis(val: any) {
  const num = new BigNumber(val)
  return num.multipliedBy(100000000).toNumber()
}

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature)

export function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput {
  let data
  switch (utxo.addressType) {
    case AddressType.P2TR:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
        tapInternalKey: assertHex(publicKey),
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2WPKH:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2PKH:
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }

    case AddressType.P2SH_P2WPKH:
      const redeemData = bitcoin.payments.p2wpkh({ pubkey: publicKey })
      data = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          value: utxo.satoshis,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
        redeemScript: redeemData.output,
      }
      return {
        data,
        utxo,
      }

    default:
      data = {
        hash: '',
        index: 0,
        witnessUtxo: {
          value: 0,
          script: Buffer.from(utxo.scriptPk, 'hex'),
        },
      }
      return {
        data,
        utxo,
      }
  }
}

export const getWitnessDataChunk = function (
  content: string,
  encodeType: BufferEncoding = 'utf8'
) {
  const buffered = Buffer.from(content, encodeType)
  const contentChunks: Buffer[] = []
  let chunks = 0

  while (chunks < buffered.byteLength) {
    const split = buffered.subarray(chunks, chunks + maximumScriptBytes)
    chunks += split.byteLength
    contentChunks.push(split)
  }

  return contentChunks
}

export const getSatpointFromUtxo = (utxo: IBlockchainInfoUTXO) => {
  return `${utxo.tx_hash_big_endian}:${utxo.tx_output_n}:0`
}

export const getInscriptionsByWalletBIS = async (
  walletAddress: string,
  offset: number = 0
) => {
  return (await axios
    .get(
      `https://api.bestinslot.xyz/v3/wallet/inscriptions?address=${walletAddress}&sort_by=inscr_num&order=asc&offset=${offset}&count=100`,
      {
        headers: {
          'X-Api-Key': 'abbfff3d-49fa-4f7f-883a-0a5fce48a9f1',
        },
      }
    )
    .then((res) => res.data?.data)) as IBISWalletIx[]
}

export function calculateAmountGathered(utxoArray: IBlockchainInfoUTXO[]) {
  return utxoArray?.reduce((prev, currentValue) => prev + currentValue.value, 0)
}

export function calculateAmountGatheredUtxo(utxoArray: Utxo[]) {
  return utxoArray?.reduce(
    (prev, currentValue) => prev + currentValue.satoshis,
    0
  )
}

export const formatOptionsToSignInputs = async ({
  _psbt,
  pubkey,
  segwitPubkey,
  segwitAddress,
  taprootAddress,
  network,
}: {
  _psbt: bitcoin.Psbt
  pubkey: string
  segwitPubkey: string
  segwitAddress: string
  taprootAddress: string
  network: bitcoin.Network
}) => {
  let toSignInputs: ToSignInput[] = []
  let index = 0
  for await (const v of _psbt.data.inputs) {
    let script: any = null
    let value = 0
    const isSigned = v.finalScriptSig || v.finalScriptWitness
    const lostInternalPubkey = !v.tapInternalKey
    if (v.witnessUtxo) {
      script = v.witnessUtxo.script
      value = v.witnessUtxo.value
    } else if (v.nonWitnessUtxo) {
      const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo)
      const output = tx.outs[_psbt.txInputs[index].index]
      script = output.script
      value = output.value
    }

    if (!isSigned || lostInternalPubkey) {
      const tapInternalKey = assertHex(Buffer.from(pubkey, 'hex'))
      const p2tr = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network: network,
      })
      if (
        v.witnessUtxo?.script.toString('hex') == p2tr.output?.toString('hex')
      ) {
        v.tapInternalKey = tapInternalKey
        if (v.tapInternalKey) {
          toSignInputs.push({
            index: index,
            publicKey: pubkey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          })
        }
      }
    }

    if (script && !isSigned && !isTaprootInput(v)) {
      toSignInputs.push({
        index: index,
        publicKey: segwitPubkey,
        sighashTypes: v.sighashType ? [v.sighashType] : undefined,
      })
    }

    index++
  }

  return toSignInputs
}

export const timeout = async (n) =>
  await new Promise((resolve) => setTimeout(resolve, n))

export const signInputs = async (
  psbt: bitcoin.Psbt,
  toSignInputs: ToSignInput[],
  taprootPubkey: string,
  segwitPubKey: string,
  segwitSigner: any,
  taprootSigner: any
) => {
  const taprootInputs: ToSignInput[] = []
  const segwitInputs: ToSignInput[] = []
  const inputs = psbt.data.inputs
  toSignInputs.forEach(({ publicKey }, i) => {
    const input = inputs[i]
    if (publicKey === taprootPubkey && !input.finalScriptWitness) {
      taprootInputs.push(toSignInputs[i])
    }
    if (segwitPubKey && segwitSigner) {
      if (publicKey === segwitPubKey) {
        segwitInputs.push(toSignInputs[i])
      }
    }
  })
  if (taprootInputs.length > 0) {
    await taprootSigner(psbt, taprootInputs)
  }
  if (segwitSigner && segwitInputs.length > 0) {
    await segwitSigner(psbt, segwitInputs)
  }
  return psbt
}

export const inscribe = async ({
  content,
  inputAddress,
  outputAddress,
  mnemonic,
  taprootPublicKey,
  segwitPublicKey,
  segwitAddress,
  isDry,
  segwitSigner,
  taprootSigner,
  feeRate,
  network,
  segwitUtxos,
  taprootUtxos,
  taprootPrivateKey,
  sandshrewBtcClient,
  esploraRpc,
}: {
  content: string
  inputAddress: string
  outputAddress: string
  mnemonic: string
  taprootPublicKey: string
  segwitPublicKey: string
  segwitAddress: string
  isDry?: boolean
  feeRate: number
  taprootSigner: any
  segwitSigner: any
  payFeesWithSegwit?: boolean
  network: 'testnet' | 'main' | 'regtest'
  segwitUtxos?: Utxo[]
  taprootUtxos: Utxo[]
  taprootPrivateKey: string
  sandshrewBtcClient: SandshrewBitcoinClient
  esploraRpc: EsploraRpc
}) => {
  const commitTxSize = calculateTaprootTxSize(3, 0, 2)
  const feeForCommit =
    commitTxSize * feeRate < 200 ? 200 : commitTxSize * feeRate

  const revealTxSize = calculateTaprootTxSize(1, 0, 1)
  const feeForReveal =
    revealTxSize * feeRate < 200 ? 200 : revealTxSize * feeRate

  const inscriptionSats = 546
  const amountNeededForInscribe =
    Number(feeForCommit) + Number(feeForReveal) + inscriptionSats

  const utxosToSend = findUtxosToCoverAmount(
    taprootUtxos,
    amountNeededForInscribe
  )

  if (
    !utxosToSend ||
    !utxosToSend.selectedUtxos ||
    utxosToSend?.selectedUtxos?.length === 0
  ) {
    throw new Error('Insufficient balance')
  }

  const amountGathered = calculateAmountGatheredUtxo(utxosToSend.selectedUtxos)

  const secret = taprootPrivateKey
  const secKey = ecc2.keys.get_seckey(String(secret))
  const pubKey = ecc2.keys.get_pubkey(String(secret), true)

  const script = createInscriptionScript(pubKey, content)
  const tapleaf = Tap.encodeScript(script)
  const [tpubkey, cblock] = Tap.getPubKey(pubKey, { target: tapleaf })
  const inscriberAddress = Address.p2tr.fromPubKey(tpubkey, network)

  const psbt = new bitcoin.Psbt({ network: getNetwork(network) })

  for await (const utxo of utxosToSend.selectedUtxos) {
    psbt.addInput({
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPk, 'hex'),
        value: utxo.satoshis,
      },
    })
  }

  const revealSats = feeForReveal + inscriptionSats
  const reimbursementAmount =
    amountGathered - feeForCommit - feeForReveal - inscriptionSats

  psbt.addOutput({
    value: Number(feeForReveal) + inscriptionSats,
    address: inscriberAddress,
  })

  if (reimbursementAmount > inscriptionSats) {
    psbt.addOutput({
      value: reimbursementAmount,
      address: inputAddress,
    })
  }

  const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
    _psbt: psbt,
    pubkey: taprootPublicKey,
    segwitPubkey: segwitPublicKey,
    segwitAddress: segwitAddress,
    taprootAddress: inputAddress,
    network: getNetwork(network),
  })

  const signedPsbt = await signInputs(
    psbt,
    toSignInputs,
    taprootPublicKey,
    segwitPublicKey,
    segwitSigner,
    taprootSigner
  )
  signedPsbt.finalizeAllInputs()

  const commitPsbtHash = signedPsbt.toHex()
  const commitTxPsbt: bitcoin.Psbt = bitcoin.Psbt.fromHex(commitPsbtHash, {
    network: getNetwork(network),
  })

  const commitTxHex = commitTxPsbt.extractTransaction().toHex()
  const commitTxId = commitTxPsbt.extractTransaction().getId()

  const [result] = await sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([
    commitTxHex,
  ])

  if (!result.allowed) {
    throw new Error(result['reject-reason'])
  }

  if (!isDry) {
    await sandshrewBtcClient.bitcoindRpc.sendRawTransaction(commitTxHex)

    const txResult = await waitForTransaction({
      txId: commitTxId,
      sandshrewBtcClient,
    })

    if (!txResult) {
      throw new Error('ERROR WAITING FOR COMMIT TX')
    }
  }

  const commitTxOutput = await getOutputValueByVOutIndex({
    txId: commitTxId,
    vOut: 0,
    esploraRpc,
  })

  if (!commitTxOutput) {
    throw new Error('ERROR GETTING FIRST INPUT VALUE')
  }

  const txData = Tx.create({
    vin: [
      {
        txid: commitTxId,
        vout: 0,
        prevout: {
          value: revealSats,
          scriptPubKey: ['OP_1', tpubkey],
        },
      },
    ],
    vout: [
      {
        value: 546,
        scriptPubKey: Address.toScriptPubKey(inputAddress),
      },
    ],
  })

  const sig = Signer.taproot.sign(secKey, txData, 0, {
    extension: tapleaf,
  })

  txData.vin[0].witness = [sig, script, cblock]

  const inscriptionTxHex = Tx.encode(txData).hex

  const [inscriptionResult] =
    await sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([inscriptionTxHex])

  if (!inscriptionResult.allowed) {
    throw new Error(inscriptionResult['reject-reason'])
  }

  let revealTxId = ''
  if (!isDry) {
    revealTxId = await sandshrewBtcClient.bitcoindRpc.sendRawTransaction(
      inscriptionTxHex
    )
  }

  return {
    commitTx: commitTxId,
    revealTx: revealTxId,
    txId: revealTxId,
    rawTx: inscriptionTxHex,
  }
}

export const createInscriptionScript = (pubKey: any, content: any) => {
  const mimeType = 'text/plain;charset=utf-8'
  const textEncoder = new TextEncoder()
  const marker = textEncoder.encode('ord')
  return [
    pubKey,
    'OP_CHECKSIG',
    'OP_0',
    'OP_IF',
    marker,
    '01',
    textEncoder.encode(mimeType),
    'OP_0',
    textEncoder.encode(content),
    'OP_ENDIF',
  ] as string[]
}

export let RPC_ADDR =
  'https://mainnet.sandshrew.io/v1/6e3bc3c289591bb447c116fda149b094'

export const callBTCRPCEndpoint = async (
  method: string,
  params: string | string[],
  network: string
) => {
  if (network === 'testnet') {
    RPC_ADDR =
      'https://testnet.sandshrew.io/v1/6e3bc3c289591bb447c116fda149b094'
  }
  if (network === 'regtest') {
    RPC_ADDR === 'http://localhost:3000/v1/regtest'
  }
  const data = JSON.stringify({
    jsonrpc: '2.0',
    id: method,
    method: method,
    params: [params],
  })

  // @ts-ignore
  return await axios
    .post(RPC_ADDR, data, {
      headers: {
        'content-type': 'application/json',
      },
    })
    .then((res) => res.data)
    .catch((e) => {
      console.error(e.response)
      throw e
    })
}

export async function waitForTransaction({
  txId,
  sandshrewBtcClient,
}: {
  txId: string
  sandshrewBtcClient: SandshrewBitcoinClient
}): Promise<[boolean, any?]> {
  console.log('WAITING FOR TRANSACTION: ', txId)
  const timeout: number = 60000 // 1 minute in milliseconds

  const startTime: number = Date.now()

  while (true) {
    try {
      // Call the endpoint to check the transaction
      const result = await sandshrewBtcClient.bitcoindRpc.getMemPoolEntry(txId)

      // Check if the transaction is found
      if (result) {
        console.log('Transaction found in mempool:', txId)
        return [true, result]
      }

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return [false]
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error) {
      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return [false]
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

export async function getOutputValueByVOutIndex({
  txId,
  vOut,
  esploraRpc,
}: {
  txId: string
  vOut: number
  esploraRpc: EsploraRpc
}): Promise<any[] | null> {
  const timeout: number = 60000 // 1 minute in milliseconds
  const startTime: number = Date.now()

  while (true) {
    const txDetails = await esploraRpc.getTxInfo(txId)

    if (txDetails?.vout && txDetails.vout.length > 0) {
      return [txDetails.vout[vOut].value, txDetails.vout[vOut].scriptpubkey]
    }

    // Check for timeout
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout reached, stopping search.')
    }

    // Wait for 5 seconds before retrying
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

export function calculateTaprootTxSize(
  taprootInputCount: number,
  nonTaprootInputCount: number,
  outputCount: number
): number {
  const baseTxSize = 10 // Base transaction size without inputs/outputs

  // Size contributions from inputs
  const taprootInputSize = 57 // Average size of a Taproot input (can vary)
  const nonTaprootInputSize = 41 // Average size of a non-Taproot input (can vary)

  const outputSize = 34 // Average size of an output (can vary)

  const totalInputSize =
    taprootInputCount * taprootInputSize +
    nonTaprootInputCount * nonTaprootInputSize
  const totalOutputSize = outputCount * outputSize

  return baseTxSize + totalInputSize + totalOutputSize
}

export async function getRawTxnHashFromTxnId(txnId: string) {
  const res = await axios.post(
    'https://mainnet.sandshrew.io/v1/6e3bc3c289591bb447c116fda149b094',
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'btc_getrawtransaction',
      params: [txnId],
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  )

  return res.data
}

export const isP2PKH = (
  script: Buffer,
  network: Network
): BitcoinPaymentType => {
  const p2pkh = checkPaymentType(bitcoin.payments.p2pkh, network)(script)
  return {
    type: 'p2pkh',
    payload: p2pkh,
  }
}
export const isP2WPKH = (
  script: Buffer,
  network: Network
): BitcoinPaymentType => {
  const p2wpkh = checkPaymentType(bitcoin.payments.p2wpkh, network)(script)
  return {
    type: 'p2wpkh',
    payload: p2wpkh,
  }
}
export const isP2WSHScript = (
  script: Buffer,
  network: Network
): BitcoinPaymentType => {
  const p2wsh = checkPaymentType(bitcoin.payments.p2wsh, network)(script)
  return {
    type: 'p2sh',
    payload: p2wsh,
  }
}
export const isP2SHScript = (
  script: Buffer,
  network: Network
): BitcoinPaymentType => {
  const p2sh = checkPaymentType(bitcoin.payments.p2sh, network)(script)
  return {
    type: 'p2sh',
    payload: p2sh,
  }
}
export const isP2TR = (
  script: Buffer,
  network: Network
): BitcoinPaymentType => {
  const p2tr = checkPaymentType(bitcoin.payments.p2tr, network)(script)
  return {
    type: 'p2tr',
    payload: p2tr,
  }
}

export const sendCollectible = async ({
  inscriptionId,
  inputAddress,
  outputAddress,
  taprootPublicKey,
  segwitPublicKey,
  segwitAddress,
  isDry,
  segwitSigner,
  taprootSigner,
  payFeesWithSegwit = false,
  feeRate,
  network,
  taprootUtxos,
  segwitUtxos,
  metaOutputValue,
  sandshrewBtcClient,
}: {
  inscriptionId: string
  inputAddress: string
  outputAddress: string
  mnemonic: string
  taprootPublicKey: string
  segwitPublicKey: string
  segwitAddress: string
  isDry?: boolean
  feeRate: number
  segwitSigner: any
  taprootSigner: any
  payFeesWithSegwit?: boolean
  network: 'testnet' | 'main' | 'regtest'
  taprootUtxos: Utxo[]
  segwitUtxos: Utxo[]
  metaOutputValue: number
  sandshrewBtcClient: SandshrewBitcoinClient
}) => {
  const psbt = new bitcoin.Psbt({ network: getNetwork(network) })

  const utxosToSend = await insertCollectibleUtxo({
    taprootUtxos: taprootUtxos,
    inscriptionId: inscriptionId,
    toAddress: outputAddress,
    psbt: psbt,
  })

  psbt.txOutputs[0].value = metaOutputValue

  await getUtxosForFees({
    payFeesWithSegwit: payFeesWithSegwit,
    psbtTx: psbt,
    taprootUtxos: taprootUtxos,
    segwitUtxos: segwitUtxos,
    segwitAddress: segwitAddress,
    feeRate: feeRate,
    taprootAddress: inputAddress,
    segwitPubKey: segwitPublicKey,
    utxosToSend: utxosToSend,
    network: getNetwork(network),
    fromAddress: inputAddress,
  })

  const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
    _psbt: psbt,
    pubkey: taprootPublicKey,
    segwitPubkey: segwitPublicKey,
    segwitAddress: segwitAddress,
    taprootAddress: inputAddress,
    network: getNetwork(network),
  })

  const signedPsbt = await signInputs(
    psbt,
    toSignInputs,
    taprootPublicKey,
    segwitPublicKey,
    segwitSigner,
    taprootSigner
  )

  signedPsbt.finalizeAllInputs()

  const rawTx = signedPsbt.extractTransaction().toHex()
  const txId = signedPsbt.extractTransaction().getId()

  const [result] = await sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([
    rawTx,
  ])

  if (!result.allowed) {
    throw new Error(result['reject-reason'])
  }

  if (!isDry) {
    await sandshrewBtcClient.bitcoindRpc.sendRawTransaction(rawTx)
  }

  return { txId, rawTx }
}

const insertCollectibleUtxo = async ({
  taprootUtxos,
  inscriptionId,
  toAddress,
  psbt,
}: {
  taprootUtxos: any[]
  inscriptionId: string
  toAddress: string
  psbt: bitcoin.Psbt
}) => {
  const { metaUtxos } = taprootUtxos.reduce(
    (acc, utxo) => {
      utxo.inscriptions.length
        ? acc.metaUtxos.push(utxo)
        : acc.nonMetaUtxos.push(utxo)
      return acc
    },
    { metaUtxos: [], nonMetaUtxos: [] }
  )

  return await addInscriptionUtxo({
    metaUtxos: metaUtxos,
    inscriptionId: inscriptionId,
    toAddress: toAddress,
    psbtTx: psbt,
  })
}

const insertBtcUtxo = async ({
  taprootUtxos,
  segwitUtxos,
  toAddress,
  fromAddress,
  psbt,
  amount,
  useTaprootUtxos,
  segwitPubKey,
  feeRate,
  network,
}: {
  taprootUtxos: any[]
  segwitUtxos: any[]
  toAddress: string
  fromAddress: string
  psbt: bitcoin.Psbt
  feeRate: number
  amount: number
  useTaprootUtxos: boolean
  segwitPubKey: string
  network: bitcoin.Network
}) => {
  let nonMetaUtxos: any[]
  if (useTaprootUtxos) {
    nonMetaUtxos = await filterTaprootUtxos({ taprootUtxos: taprootUtxos })
  } else {
    nonMetaUtxos = segwitUtxos
  }

  return await addBTCUtxo({
    utxos: nonMetaUtxos,
    toAddress: toAddress,
    psbtTx: psbt,
    amount: amount,
    fromAddress: fromAddress,
    segwitPubKey: segwitPubKey,
    feeRate,
    network,
  })
}

export const filterTaprootUtxos = async ({
  taprootUtxos,
}: {
  taprootUtxos: any[]
}) => {
  const { nonMetaUtxos } = taprootUtxos.reduce(
    (acc, utxo) => {
      utxo.inscriptions.length > 0 || utxo.satoshis === 546
        ? acc.metaUtxos.push(utxo)
        : acc.nonMetaUtxos.push(utxo)
      return acc
    },
    { metaUtxos: [], nonMetaUtxos: [] }
  )
  return nonMetaUtxos
}

const addBTCUtxo = async ({
  utxos,
  toAddress,
  psbtTx,
  amount,
  feeRate,
  fromAddress,
  segwitPubKey,
  network,
}: {
  utxos: Utxo[]
  toAddress: string
  psbtTx: bitcoin.Psbt
  amount: number
  feeRate: number
  fromAddress: string
  segwitPubKey: string
  network: bitcoin.Network
}) => {
  const txSize = calculateTaprootTxSize(3, 0, 2)
  const fee = txSize * feeRate < 200 ? 200 : txSize * feeRate

  const utxosToSend = findUtxosToCoverAmount(utxos, amount + fee)
  if (!utxosToSend) {
    throw new Error('insufficient balance')
  }

  const amountGathered = calculateAmountGatheredUtxo(utxosToSend.selectedUtxos)
  const addressType = getAddressType(fromAddress)
  let redeemScript
  if (addressType === 2) {
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(segwitPubKey, 'hex'),
      network: network,
    })
    redeemScript = p2wpkh.output
  }

  for (let i = 0; i < utxosToSend.selectedUtxos.length; i++) {
    if (addressType === 2) {
      psbtTx.addInput({
        hash: utxosToSend.selectedUtxos[i].txId,
        index: utxosToSend.selectedUtxos[i].outputIndex,
        witnessUtxo: {
          value: utxosToSend.selectedUtxos[i].satoshis,
          script: Buffer.from(utxosToSend.selectedUtxos[i].scriptPk, 'hex'),
        },
        redeemScript: redeemScript,
      })
    } else {
      psbtTx.addInput({
        hash: utxosToSend.selectedUtxos[i].txId,
        index: utxosToSend.selectedUtxos[i].outputIndex,
        witnessUtxo: {
          value: utxosToSend.selectedUtxos[i].satoshis,
          script: Buffer.from(utxosToSend.selectedUtxos[i].scriptPk, 'hex'),
        },
      })
    }
  }

  psbtTx.addOutput({
    address: toAddress,
    value: Math.floor(amount),
  })

  const changeAmount = amountGathered - amount - fee
  if (changeAmount > 546) {
    psbtTx.addOutput({
      address: fromAddress,
      value: changeAmount,
    })
  }

  return utxosToSend
}

export const isValidJSON = (str: string) => {
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

export const createBtcTx = async ({
  inputAddress,
  outputAddress,
  mnemonic,
  taprootPublicKey,
  segwitPublicKey,
  segwitAddress,
  isDry,
  segwitSigner,
  taprootSigner,
  payFeesWithSegwit = false,
  feeRate,
  amount,
  network,
  segwitUtxos,
  taprootUtxos,
}: {
  inputAddress: string
  outputAddress: string
  mnemonic: string
  taprootPublicKey: string
  segwitPublicKey: string
  segwitAddress: string
  isDry?: boolean
  feeRate: number
  segwitSigner: any
  taprootSigner: any
  payFeesWithSegwit?: boolean
  amount: number
  network: bitcoin.Network
  segwitUtxos: Utxo[]
  taprootUtxos: Utxo[]
}) => {
  const psbt = new bitcoin.Psbt({ network: network })
  const inputAddressType = addressTypeMap[getAddressType(inputAddress)]
  const useTaprootUtxos = !(
    addressTypeToName[inputAddressType] === 'nested-segwit' ||
    addressTypeToName[inputAddressType] === 'segwit'
  )

  await insertBtcUtxo({
    taprootUtxos: taprootUtxos,
    segwitUtxos: segwitUtxos,
    psbt: psbt,
    toAddress: outputAddress,
    amount: amount,
    useTaprootUtxos: useTaprootUtxos,
    segwitPubKey: segwitPublicKey,
    fromAddress: inputAddress,
    feeRate,
    network,
  })

  const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
    _psbt: psbt,
    pubkey: taprootPublicKey,
    segwitPubkey: segwitPublicKey,
    segwitAddress: segwitAddress,
    taprootAddress: inputAddress,
    network,
  })

  const signedPsbt = await signInputs(
    psbt,
    toSignInputs,
    taprootPublicKey,
    segwitPublicKey,
    segwitSigner,
    taprootSigner
  )

  signedPsbt.finalizeAllInputs()

  return {
    txnId: signedPsbt.extractTransaction().getId(),
    rawTxn: signedPsbt.extractTransaction().toHex(),
  }
}

export const createTaprootBtcTx = async ({}) => {
  const rawTxn = ''
  return { rawTxn: rawTxn }
}
