import * as bitcoin from 'bitcoinjs-lib'
import ECPairFactory from 'ecpair'
import ecc from '@bitcoinerlab/secp256k1'
bitcoin.initEccLib(ecc)
import {
  AddressType,
  UnspentOutput,
  TxInput,
  IBlockchainInfoUTXO,
  ToSignInput,
} from '../shared/interface'
import BigNumber from 'bignumber.js'
import { maximumScriptBytes } from './constants'
import axios from 'axios'
import { getUnspentOutputs, getAddressType } from '../transactions'
import { Wallet } from '../oylib'
import { address as PsbtAddress } from 'bitcoinjs-lib'
import { Tap, Address, Tx, Signer } from '@cmdcode/tapscript'
import * as ecc2 from '@cmdcode/crypto-utils'
import { getUtxosForFees } from '../txbuilder/buildOrdTx'

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

const RequiredPath = [
  "m/44'/0'/0'/0", // P2PKH (Legacy)
  "m/49'/0'/0'/0", // P2SH-P2WPKH (Nested SegWit)
  "m/84'/0'/0'/0", // P2WPKH (SegWit)
  "m/86'/0'/0'/0", // P2TR (Taproot)
]

export const ECPair = ECPairFactory(ecc)

export const assertHex = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33)

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  )
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

export async function createSegwitSigner({
  mnemonic,
  segwitAddress,
  segwitPubKey,
}: {
  mnemonic: string
  segwitAddress: string
  segwitPubKey: string
}) {
  if (segwitAddress && segwitPubKey) {
    let payload: any
    const wallet = new Wallet()
    const segwitAddressType = getAddressType(segwitAddress)
    if (segwitAddressType == null) {
      throw Error('Unrecognized Address Type')
    }
    if (segwitAddressType === 2) {
      payload = await wallet.fromPhrase({
        mnemonic: mnemonic.trim(),
        hdPath: RequiredPath[1],
        type: 'nested-segwit',
      })
    }
    if (segwitAddressType === 3) {
      payload = await wallet.fromPhrase({
        mnemonic: mnemonic.trim(),
        hdPath: RequiredPath[2],
        type: 'native-segwit',
      })
    }
    const segwitKeyring = payload.keyring.keyring
    const segwitSigner = segwitKeyring.signTransaction.bind(segwitKeyring)
    return segwitSigner
  }
  return undefined
}

export async function createTaprootSigner({
  mnemonic,
  taprootAddress,
}: {
  mnemonic: string
  taprootAddress: string
}) {
  const addressType = getAddressType(taprootAddress)
  if (addressType == null) {
    throw Error('Unrecognized Address Type')
  }
  const tapWallet = new Wallet()

  const tapPayload = await tapWallet.fromPhrase({
    mnemonic: mnemonic.trim(),
    hdPath: RequiredPath[3],
    type: 'taproot',
  })

  const tapKeyring = tapPayload.keyring.keyring
  const taprootSigner = tapKeyring.signTransaction.bind(tapKeyring)
  return taprootSigner
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
  console.log(utxo)
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

export const getUnspentsWithConfirmationsForAddress = async (
  address: string
) => {
  try {
    return await getUnspentOutputs(address).then(
      (unspents) =>
        unspents?.unspent_outputs.filter(
          (utxo: IBlockchainInfoUTXO) => utxo.confirmations >= 0
        ) as IBlockchainInfoUTXO[]
    )
  } catch (e: any) {
    throw new Error(e)
  }
}

export const getUTXOWorthGreatestValueForAddress = async (address: string) => {
  const unspents = await getUnspentsWithConfirmationsForAddress(address)
  return unspents.reduce(function (prev, current) {
    return prev.value > current.value ? prev : current
  })
}

export const getSatpointFromUtxo = (utxo: IBlockchainInfoUTXO) => {
  return `${utxo.tx_hash_big_endian}:${utxo.tx_output_n}:0`
}

export const getUnspentsForAddressInOrderByValue = async (address: string) => {
  const unspents = await getUnspentsWithConfirmationsForAddress(address)
  return unspents.sort((a, b) => b.value - a.value)
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

export const getUTXOsToCoverAmount = async (
  address: string,
  amountNeeded: number,
  inscriptionLocs?: string[],
  usedUtxos?: IBlockchainInfoUTXO[]
) => {
  const unspentsOrderedByValue = await getUnspentsForAddressInOrderByValue(
    address
  )
  const retrievedIxs = await getInscriptionsByWalletBIS(address)
  const bisInscriptionLocs = retrievedIxs.map(
    (utxo) => utxo.satpoint
  ) as string[]

  if (bisInscriptionLocs.length === 0) {
    inscriptionLocs = []
  } else {
    inscriptionLocs = bisInscriptionLocs
  }

  let sum = 0
  const result: IBlockchainInfoUTXO[] = []

  for await (let utxo of unspentsOrderedByValue) {
    const currentUTXO = utxo
    const utxoSatpoint = getSatpointFromUtxo(currentUTXO)
    if (
      (inscriptionLocs &&
        inscriptionLocs?.find((utxoLoc: any) => utxoLoc === utxoSatpoint)) ||
      currentUTXO.value <= 546
    ) {
      continue
    }

    if (
      (usedUtxos &&
        usedUtxos?.find(
          (utxoLoc: IBlockchainInfoUTXO) =>
            utxo.tx_hash_big_endian === utxoLoc.tx_hash_big_endian &&
            utxo.tx_output_n === utxoLoc.tx_output_n
        )) ||
      currentUTXO.value <= 546
    ) {
      console.log('SKIPPIN!!!!!!!')
      continue
    }

    sum += currentUTXO.value
    result.push(currentUTXO)
    if (sum > amountNeeded) {
      console.log('AMOUNT RETRIEVED: ', sum)
      return result
    }
  }

  return [] as IBlockchainInfoUTXO[]
}

export const getUTXOsToCoverAmountWithRemainder = async (
  address: string,
  amountNeeded: number,
  inscriptionLocs?: string[]
) => {
  const unspentsOrderedByValue = await getUnspentsForAddressInOrderByValue(
    address
  )
  const retrievedIxs = await getInscriptionsByWalletBIS(address)
  const bisInscriptionLocs = retrievedIxs.map(
    (utxo) => utxo.satpoint
  ) as string[]

  if (bisInscriptionLocs.length === 0) {
    inscriptionLocs = []
  } else {
    inscriptionLocs = bisInscriptionLocs
  }

  let sum = 0
  const result: IBlockchainInfoUTXO[] = []

  for await (let utxo of unspentsOrderedByValue) {
    const currentUTXO = utxo
    const utxoSatpoint = getSatpointFromUtxo(currentUTXO)
    if (
      (inscriptionLocs &&
        inscriptionLocs?.find((utxoLoc: any) => utxoLoc === utxoSatpoint)) ||
      currentUTXO.value <= 546
    ) {
      continue
    }

    sum += currentUTXO.value
    result.push(currentUTXO)
    if (sum > amountNeeded) {
      return result
    }
  }

  return result as IBlockchainInfoUTXO[]
}

export const getTheOtherUTXOsToCoverAmount = async (
  address: string,
  amountNeeded: number,
  inscriptionLocs?: string[]
) => {
  const unspentsOrderedByValue = await getUnspentOutputs(address)

  const retrievedIxs = await getInscriptionsByWalletBIS(address)
  const bisInscriptions = retrievedIxs.map((utxo) => utxo.satpoint) as string[]

  if (bisInscriptions.length === 0) {
    inscriptionLocs = []
  } else {
    inscriptionLocs = bisInscriptions
  }

  let sum = 0
  const result: IBlockchainInfoUTXO[] = []

  for (let i = 0; i < unspentsOrderedByValue.length; i++) {
    const currentUTXO = unspentsOrderedByValue.reverse()[i]
    const utxoSatpoint = getSatpointFromUtxo(currentUTXO)
    if (
      inscriptionLocs &&
      inscriptionLocs?.find((utxoLoc: any) => utxoLoc === utxoSatpoint)
    ) {
      continue
    }

    sum += currentUTXO.value
    result.push(currentUTXO)

    if (sum > amountNeeded) {
      return result
    }
  }

  return [] as IBlockchainInfoUTXO[]
}

export const getUTXOByAddressTxIDAndVOut = async (
  address: string,
  txId: string,
  vOut: number
) => {
  const unspents = await getUnspentsWithConfirmationsForAddress(address)
  return unspents.find(
    (utxo) => utxo.tx_hash_big_endian === txId && utxo.tx_output_n === vOut
  )
}

export function calculateAmountGathered(utxoArray: IBlockchainInfoUTXO[]) {
  return utxoArray?.reduce((prev, currentValue) => prev + currentValue.value, 0)
}

export const getScriptForAddress = async (address: string) => {
  const utxos = await getUnspentOutputs(address)
  const { script } = utxos.unspent_outputs[0]
  return script
}

export const formatOptionsToSignInputs = async ({
  _psbt,
  isRevealTx,
  pubkey,
  segwitPubkey,
}: {
  _psbt: string | bitcoin.Psbt
  isRevealTx: boolean
  pubkey: string
  segwitPubkey: string
}) => {
  let toSignInputs: ToSignInput[] = []
  const psbtNetwork = bitcoin.networks.bitcoin

  const psbt =
    typeof _psbt === 'string'
      ? bitcoin.Psbt.fromHex(_psbt as string, { network: psbtNetwork })
      : (_psbt as bitcoin.Psbt)

  psbt.data.inputs.forEach((v, index: number) => {
    let script: any = null
    let value = 0
    const isSigned = v.finalScriptSig || v.finalScriptWitness
    const lostInternalPubkey = !v.tapInternalKey
    if (v.witnessUtxo) {
      script = v.witnessUtxo.script
      value = v.witnessUtxo.value
    } else if (v.nonWitnessUtxo) {
      const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo)
      const output = tx.outs[psbt.txInputs[index].index]
      script = output.script
      value = output.value
    }
    if (!isSigned && lostInternalPubkey) {
      const tapInternalKey = assertHex(Buffer.from(pubkey, 'hex'))
      const p2tr = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network: psbtNetwork,
      })
      if (
        v.witnessUtxo?.script.toString('hex') == p2tr.output?.toString('hex')
      ) {
        v.tapInternalKey = tapInternalKey
      }
    }

    if (script && !isSigned) {
      const address = PsbtAddress.fromOutputScript(script, psbtNetwork)
      if (isRevealTx || (!isRevealTx && address === address)) {
        if (v.tapInternalKey) {
          toSignInputs.push({
            index: index,
            publicKey: pubkey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          })
        }
      } else {
        toSignInputs.push({
          index: index,
          publicKey: segwitPubkey,
          sighashTypes: v.sighashType ? [v.sighashType] : undefined,
        })
      }
    }
  })

  return toSignInputs
}

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
  toSignInputs.forEach(({ index, publicKey }) => {
    if (publicKey === taprootPubkey) {
      taprootInputs.push(toSignInputs[index])
    }
    if (segwitPubKey && segwitSigner) {
      if (publicKey === segwitPubKey) {
        segwitInputs.push(toSignInputs[index])
      }
    }
  })
  await taprootSigner(psbt, taprootInputs)
  if (segwitSigner && segwitInputs.length > 0) {
    await segwitSigner(psbt, segwitInputs)
  }
  return psbt
}

export const inscribe = async ({
  ticker,
  amount,
  inputAddress,
  outputAddress,
  mnemonic,
  taprootPublicKey,
  segwitPublicKey,
  segwitAddress,
  isDry,
}: {
  ticker: string
  amount: number
  inputAddress: string
  outputAddress: string
  mnemonic: string
  taprootPublicKey: string
  segwitPublicKey: string
  segwitAddress: string
  isDry?: boolean
}) => {
  const { fastestFee } = await getRecommendedBTCFeesMempool()
  const inputs = 1
  const vB = inputs * 149 + 3 * 32 + 12
  const minerFee = vB * fastestFee
  const fees = minerFee + 4000

  try {
    const secret =
      'd84d671cbd24a08db5ed43b93102484bd9bd8beb657e784451a226cf6a6e259b'

    const secKey = ecc2.keys.get_seckey(String(secret))
    const pubKey = ecc2.keys.get_pubkey(String(secret), true)
    const content = `{"p":"brc-20","op":"transfer","tick":"${ticker}","amt":"${amount}"}`

    const script = createInscriptionScript(pubKey, content)
    const tapleaf = Tap.encodeScript(script)
    const [tpubkey, cblock] = Tap.getPubKey(pubKey, { target: tapleaf })
    const inscriberAddress = Address.p2tr.fromPubKey(tpubkey)

    const wallet = new Wallet()
    const psbt = new bitcoin.Psbt()

    const taprootUtxos = await wallet.getUtxosArtifacts({
      address: inputAddress,
    })
    let segwitUtxos: any[] | undefined
    if (segwitAddress) {
      segwitUtxos = await wallet.getUtxosArtifacts({
        address: segwitAddress,
      })
    }

    const inputs = psbt.inputCount
    const commitVb = calculateTaprootTxSize(inputs, 0, 2)
    const revealVb = calculateTaprootTxSize(inputs, 0, 1)
    const commitSatsNeeded = Math.floor((commitVb + 10) * fastestFee)
    const revealSatsNeeded = Math.floor((revealVb + 10) * fastestFee)

    psbt.addOutput({
      value: revealSatsNeeded,
      address: inscriberAddress,
    })

    await getUtxosForFees({
      payFeesWithSegwit: !!segwitAddress,
      psbtTx: psbt,
      taprootUtxos: taprootUtxos,
      segwitUtxos: segwitUtxos,
      segwitAddress: segwitAddress,
      feeRate: fastestFee,
      taprootAddress: inputAddress,
    })

    const toSignInputs: ToSignInput[] = await formatOptionsToSignInputs({
      _psbt: psbt,
      isRevealTx: false,
      pubkey: taprootPublicKey,
      segwitPubkey: segwitPublicKey,
    })

    const taprootSigner = await createTaprootSigner({
      mnemonic: mnemonic,
      taprootAddress: inputAddress,
    })

    const segwitSigner = await createSegwitSigner({
      mnemonic: mnemonic,
      segwitAddress: segwitAddress,
      segwitPubKey: segwitPublicKey,
    })

    await signInputs(
      psbt,
      toSignInputs,
      taprootPublicKey,
      segwitPublicKey,
      segwitSigner,
      taprootSigner
    )

    psbt.finalizeAllInputs()

    const commitHex = psbt.extractTransaction().toHex()
    console.log('commit hex', commitHex)

    const commitTxPsbt: bitcoin.Psbt = bitcoin.Psbt.fromHex(commitHex)

    const commitTxHex = commitTxPsbt.extractTransaction().toHex()
    let commitTxId: string
    if (isDry) {
      commitTxId = commitTxPsbt.extractTransaction().getId()
      console.log('commit txId', commitTxId)
    } else {
      const { result } = await callBTCRPCEndpoint(
        'sendrawtransaction',
        commitTxHex
      )
      commitTxId = result
    }

    if (!isDry) {
      const txResult = await waitForTransaction(commitTxId)
      if (!txResult) {
        return { error: 'ERROR WAITING FOR COMMIT TX' }
      }
    }

    const txData = Tx.create({
      vin: [
        {
          txid: commitTxId,
          vout: 0,
          prevout: {
            value: revealSatsNeeded,
            scriptPubKey: ['OP_1', tpubkey],
          },
        },
      ],
      vout: [
        {
          value: 546,
          scriptPubKey: Address.toScriptPubKey(outputAddress),
        },
      ],
    })

    const sig = Signer.taproot.sign(secKey, txData, 0, {
      extension: tapleaf,
    })
    txData.vin[0].witness = [sig, script, cblock]

    if (!isDry) {
      return await callBTCRPCEndpoint(
        'sendrawtransaction',
        Tx.encode(txData).hex
      )
    } else {
      console.log({ result: Tx.util.getTxid(txData) })
      return { result: Tx.util.getTxid(txData) }
    }
  } catch (e: any) {
    // console.error(e);
    return { error: e.message }
  }
}

export const MEMPOOL_SPACE_API_V1_URL = 'https://mempool.space/api/v1'

const getRecommendedBTCFeesMempool = async () => {
  const gen_res = await axios
    .get(`${MEMPOOL_SPACE_API_V1_URL}/fees/recommended`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then((res) => res.data)

  return await gen_res
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
  ]
}

const INSCRIPTION_PREPARE_SAT_AMOUNT = 4000

export const RPC_ADDR =
  'https://node.oyl.gg/v1/6e3bc3c289591bb447c116fda149b094'

export const callBTCRPCEndpoint = async (
  method: string,
  params: string | string[]
) => {
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

export async function waitForTransaction(txId: string): Promise<boolean> {
  console.log('WAITING FOR TRANSACTION: ', txId)
  const timeout: number = 60000 // 1 minute in milliseconds

  const startTime: number = Date.now()

  while (true) {
    try {
      // Call the endpoint to check the transaction
      const response = await callBTCRPCEndpoint('esplora_tx', txId)

      // Check if the transaction is found
      if (response && response.result) {
        console.log('Transaction found in mempool:', txId)
        return true
      }

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return false
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error) {
      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return false
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

export async function getOutputValueByVOutIndex(
  commitTxId: string,
  vOut: number
): Promise<number | null> {
  const timeout: number = 60000 // 1 minute in milliseconds
  const startTime: number = Date.now()

  while (true) {
    try {
      // Call to get the transaction details
      const txDetails = await callBTCRPCEndpoint('esplora_tx', commitTxId)

      if (
        txDetails &&
        txDetails.result &&
        txDetails.result.vout &&
        txDetails.result.vout.length > 0
      ) {
        // Retrieve the value of the first output
        return txDetails.result.vout[vOut].value
      }

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return null
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    } catch (error) {
      console.error('Error fetching transaction output value:', error)

      // Check for timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout reached, stopping search.')
        return null
      }

      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
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

  // Size contributions from outputs
  const outputSize = 34 // Average size of an output (can vary)

  // Calculate total input and output sizes
  const totalInputSize =
    taprootInputCount * taprootInputSize +
    nonTaprootInputCount * nonTaprootInputSize
  const totalOutputSize = outputCount * outputSize

  // Total transaction size
  return baseTxSize + totalInputSize + totalOutputSize
}
