import { minimumFee } from '../btc/btc'
import { Provider } from '../provider/provider'
import * as bitcoin from 'bitcoinjs-lib'
import * as envelope from 'alkanes/lib/index.js'
import { Account } from '../account/account'
import {
  findXAmountOfSats,
  formatInputsToSign,
  getOutputValueByVOutIndex,
  inscriptionSats,
  tweakSigner,
} from '..'
import { OylTransactionError } from '../errors'
import { GatheredUtxos, AlkanesPayload } from '../shared/interface'
import { getAddressType } from '..'
import { Signer } from '../signer'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { LEAF_VERSION_TAPSCRIPT } from 'bitcoinjs-lib/src/payments/bip341'
import path from 'path'
import fs from 'fs-extra'
import { gzip as _gzip } from 'node:zlib'
import { promisify } from 'util'
import { ProtoStone, encodeRunestoneProtostone } from 'alkanes/lib/index.js'
import { u32, u128 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { Outpoint } from 'rpclient/alkanes'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'

interface AlkaneId {
  block: string
  tx: string
}

export const createSendPsbt = async ({
  gatheredUtxos,
  account,
  alkaneId,
  provider,
  toAddress,
  amount,
  feeRate,
  fee,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  alkaneId: { block: string; tx: string }
  provider: Provider
  toAddress: string
  amount: number
  feeRate?: number
  fee?: number
}) => {
  try {
    const originalGatheredUtxos = gatheredUtxos

    const minFee = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 3,
    })
    const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    let finalFee = fee ? fee : calculatedFee

    gatheredUtxos = findXAmountOfSats(
      originalGatheredUtxos.utxos,
      Number(finalFee) + Number(inscriptionSats)
    )

    if (gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 3,
      })

      finalFee = Math.max(txSize * feeRate, 250)
      gatheredUtxos = findXAmountOfSats(
        originalGatheredUtxos.utxos,
        Number(finalFee) + Number(amount)
      )
    }

    let psbt = new bitcoin.Psbt({ network: provider.network })
    const { alkaneUtxos, totalSatoshis } = await findAlkaneUtxos({
      address: account.taproot.address,
      greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
      alkaneId,
      provider,
      targetNumberOfAlkanes: amount,
    })

    for await (const utxo of alkaneUtxos) {
      if (getAddressType(utxo.address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(utxo.txId)
        psbt.addInput({
          hash: utxo.txId,
          index: parseInt(utxo.txIndex),
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(utxo.address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: utxo.txId,
          index: parseInt(utxo.txIndex),
          redeemScript: redeemScript,
          witnessUtxo: {
            value: utxo.satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(utxo.address) === 1 ||
        getAddressType(utxo.address) === 3
      ) {
        psbt.addInput({
          hash: utxo.txId,
          index: parseInt(utxo.txIndex),
          witnessUtxo: {
            value: utxo.satoshis,
            script: Buffer.from(utxo.script, 'hex'),
          },
        })
      }
    }

    if (gatheredUtxos.totalAmount < finalFee + inscriptionSats * 2) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
      if (getAddressType(gatheredUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          gatheredUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(gatheredUtxos.utxos[i].address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          redeemScript: redeemScript,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(gatheredUtxos.utxos[i].address) === 1 ||
        getAddressType(gatheredUtxos.utxos[i].address) === 3
      ) {
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
          },
        })
      }
    }

    const protostone = encodeRunestoneProtostone({
      protostones: [
        ProtoStone.message({
          protocolTag: 1n,
          edicts: [
            {
              id: new ProtoruneRuneId(
                u128(BigInt(alkaneId.block)),
                u128(BigInt(alkaneId.tx))
              ),
              amount: u128(BigInt(amount)),
              output: u32(BigInt(1)),
            },
          ],
          pointer: 0,
          refundPointer: 0,
          calldata: Buffer.from([]),
        }),
      ],
    }).encodedRunestone

    psbt.addOutput({
      value: inscriptionSats,
      address: account.taproot.address,
    })

    psbt.addOutput({
      value: inscriptionSats,
      address: toAddress,
    })

    const output = { script: protostone, value: 0 }
    psbt.addOutput(output)

    const changeAmount =
      gatheredUtxos.totalAmount +
      totalSatoshis -
      (finalFee + inscriptionSats * 2)

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return { psbt: formattedPsbtTx.toBase64() }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const createExecutePsbt = async ({
  gatheredUtxos,
  account,
  calldata,
  provider,
  feeRate,
  fee = 0,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  calldata: bigint[]
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    const originalGatheredUtxos = gatheredUtxos

    const minTxSize = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    let calculatedFee = Math.max(minTxSize * feeRate, 250)
    let finalFee = fee === 0 ? calculatedFee : fee

    gatheredUtxos = findXAmountOfSats(
      originalGatheredUtxos.utxos,
      Number(finalFee)
    )

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (fee === 0 && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2,
      })
      finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate

      if (gatheredUtxos.totalAmount < finalFee) {
        throw new OylTransactionError(Error('Insufficient Balance'))
      }
    }

    if (gatheredUtxos.totalAmount < finalFee) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }
    for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
      if (getAddressType(gatheredUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          gatheredUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(gatheredUtxos.utxos[i].address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          redeemScript: redeemScript,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(gatheredUtxos.utxos[i].address) === 1 ||
        getAddressType(gatheredUtxos.utxos[i].address) === 3
      ) {
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
          },
        })
      }
    }

    psbt.addOutput({
      value: 546,
      address: account.taproot.address,
    })

    const script = encodeRunestoneProtostone({
      protostones: [
        envelope.ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: envelope.encipher(calldata),
        }),
      ],
    }).encodedRunestone

    const output = { script, value: 0 }
    psbt.addOutput(output)

    const changeAmount = gatheredUtxos.totalAmount - finalFee - 546

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return {
      psbt: formattedPsbtTx.toBase64(),
      psbtHex: formattedPsbtTx.toHex(),
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const createDeployCommit = async ({
  payload,
  gatheredUtxos,
  tweakedTaprootKeyPair,
  account,
  provider,
  feeRate,
  fee,
}: {
  payload?: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  tweakedTaprootKeyPair: bitcoin.Signer
  account: Account
  provider: Provider
  feeRate?: number
  fee?: number
}) => {
  try {
    const originalGatheredUtxos = gatheredUtxos

    const minFee = minimumFee({
      taprootInputCount: 2,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })
    const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    let finalFee = fee ? fee : calculatedFee

    let psbt = new bitcoin.Psbt({ network: provider.network })

    if (!payload) {
      const binary = new Uint8Array(
        Array.from(
          await fs.readFile(path.join(__dirname, './', 'free_mint.wasm'))
        )
      )
      const gzip = promisify(_gzip)
      payload = {
        body: await gzip(binary, { level: 9 }),
        cursed: false,
        tags: { contentType: '' },
      }
    }

    const script = Buffer.from(
      envelope.p2tr_ord_reveal(toXOnly(tweakedTaprootKeyPair.publicKey), [
        payload,
      ]).script
    )

    const inscriberInfo = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
      scriptTree: {
        output: script,
      },
      network: provider.network,
    })

    psbt.addOutput({
      value: 20000 + 546,
      address: inscriberInfo.address,
    })

    gatheredUtxos = findXAmountOfSats(
      originalGatheredUtxos.utxos,
      20000 + Number(inscriptionSats)
    )

    if (!fee && gatheredUtxos.utxos.length > 1) {
      const txSize = minimumFee({
        taprootInputCount: gatheredUtxos.utxos.length,
        nonTaprootInputCount: 0,
        outputCount: 2,
      })
      finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate

      if (gatheredUtxos.totalAmount < finalFee) {
        gatheredUtxos = findXAmountOfSats(
          originalGatheredUtxos.utxos,
          20000 + Number(inscriptionSats)
        )
      }
    }

    for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
      if (getAddressType(gatheredUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          gatheredUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(gatheredUtxos.utxos[i].address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          redeemScript: redeemScript,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(gatheredUtxos.utxos[i].address) === 1 ||
        getAddressType(gatheredUtxos.utxos[i].address) === 3
      ) {
        psbt.addInput({
          hash: gatheredUtxos.utxos[i].txId,
          index: gatheredUtxos.utxos[i].outputIndex,
          witnessUtxo: {
            value: gatheredUtxos.utxos[i].satoshis,
            script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
          },
        })
      }
    }

    if (gatheredUtxos.totalAmount < finalFee + inscriptionSats) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    const changeAmount =
      gatheredUtxos.totalAmount - (finalFee + 20000 + inscriptionSats)

    psbt.addOutput({
      address: account[account.spendStrategy.changeAddress].address,
      value: changeAmount,
    })

    const formattedPsbtTx = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: account.taproot.pubkey,
      network: provider.network,
    })

    return { psbt: formattedPsbtTx.toBase64(), script }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const createDeployReveal = async ({
  createReserveNumber,
  receiverAddress,
  script,
  feeRate,
  tweakedTaprootKeyPair,
  provider,
  fee = 0,
  commitTxId,
}: {
  createReserveNumber: string
  receiverAddress: string
  script: Buffer
  feeRate: number
  tweakedTaprootKeyPair: bitcoin.Signer
  provider: Provider
  fee?: number
  commitTxId: string
}) => {
  try {
    if (!feeRate) {
      feeRate = (await provider.esplora.getFeeEstimates())['1']
    }

    const psbt: bitcoin.Psbt = new bitcoin.Psbt({ network: provider.network })
    const minFee = minimumFee({
      taprootInputCount: 1,
      nonTaprootInputCount: 0,
      outputCount: 2,
    })

    const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate
    const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee

    const commitTxOutput = await getOutputValueByVOutIndex({
      txId: commitTxId,
      vOut: 0,
      esploraRpc: provider.esplora,
    })

    if (!commitTxOutput) {
      throw new Error('Error getting vin #0 value')
    }

    const protostone = encodeRunestoneProtostone({
      protostones: [
        envelope.ProtoStone.message({
          protocolTag: 1n,
          edicts: [],
          pointer: 0,
          refundPointer: 0,
          calldata: envelope.encipher([
            BigInt(3),
            BigInt(createReserveNumber),
            BigInt(100),
          ]),
        }),
      ],
    }).encodedRunestone

    const p2pk_redeem = { output: script }

    const { output, witness } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
      scriptTree: p2pk_redeem,
      redeem: p2pk_redeem,
      network: provider.network,
    })

    psbt.addInput({
      hash: commitTxId,
      index: 0,
      witnessUtxo: {
        value: commitTxOutput.value,
        script: output,
      },
      tapLeafScript: [
        {
          leafVersion: LEAF_VERSION_TAPSCRIPT,
          script: p2pk_redeem.output,
          controlBlock: witness![witness!.length - 1],
        },
      ],
    })

    psbt.addOutput({
      value: 546,
      address: receiverAddress,
    })

    psbt.addOutput({
      value: 0,
      script: protostone,
    })

    if (revealTxChange > 546) {
      psbt.addOutput({
        value: revealTxChange,
        address: receiverAddress,
      })
    }

    psbt.signInput(0, tweakedTaprootKeyPair)
    psbt.finalizeInput(0)

    return {
      psbt: psbt.toBase64(),
      psbtHex: psbt.extractTransaction().toHex(),
      fee: revealTxChange,
    }
  } catch (error) {
    throw new OylTransactionError(error)
  }
}

export const findAlkaneUtxos = async ({
  address,
  greatestToLeast,
  provider,
  alkaneId,
  targetNumberOfAlkanes,
}: {
  address: string
  greatestToLeast: boolean
  provider: Provider
  alkaneId: { block: string; tx: string }
  targetNumberOfAlkanes: number
}) => {
  const res: Outpoint[] = await provider.alkanes.getAlkanesByAddress({
    address: address,
    protocolTag: '1',
  })

  const matchingRunesWithOutpoints = res.flatMap((outpoint) =>
    outpoint.runes
      .filter(
        (value) =>
          value.rune.id.block === alkaneId.block &&
          value.rune.id.tx === alkaneId.tx
      )
      .map((rune) => ({ rune, outpoint }))
  )

  const sortedRunesWithOutpoints = matchingRunesWithOutpoints.sort((a, b) =>
    greatestToLeast
      ? Number(b.rune.balance) - Number(a.rune.balance)
      : Number(a.rune.balance) - Number(b.rune.balance)
  )

  let totalSatoshis: number = 0
  let totalBalanceBeingSent: number = 0
  const alkaneUtxos = []

  for (const alkane of sortedRunesWithOutpoints) {
    if (totalBalanceBeingSent < targetNumberOfAlkanes) {
      const satoshis = Number(alkane.outpoint.output.value)
      alkaneUtxos.push({
        txId: Buffer.from(
          Array.from(
            Buffer.from(alkane.outpoint.outpoint.txid, 'hex')
          ).reverse()
        ).toString('hex'),
        txIndex: alkane.outpoint.outpoint.vout,
        script: alkane.outpoint.output.script,
        address,
        amountOfAlkanes: alkane.rune.balance,
        satoshis,
      })
      totalSatoshis += satoshis
      totalBalanceBeingSent +=
        Number(alkane.rune.balance) / 10 ** alkane.rune.rune.divisibility
    } else {
      break
    }
  }

  return { alkaneUtxos, totalSatoshis }
}

export const actualSendFee = async ({
  gatheredUtxos,
  account,
  alkaneId,
  provider,
  toAddress,
  amount,
  feeRate,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  alkaneId: { block: string; tx: string }
  provider: Provider
  toAddress: string
  amount: number
  feeRate?: number
  signer: Signer
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createSendPsbt({
    gatheredUtxos,
    account,
    alkaneId,
    provider,
    toAddress,
    amount,
    feeRate,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })

  const signedHexPsbt = rawPsbt.extractTransaction().toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalPsbt } = await createSendPsbt({
    gatheredUtxos,
    account,
    alkaneId,
    provider,
    toAddress,
    amount,
    feeRate,
    fee: correctFee,
  })

  const { signedPsbt: signedAll } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
    network: account.network,
  })

  const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const actualDeployCommitFee = async ({
  payload,
  tweakedTaprootKeyPair,
  gatheredUtxos,
  account,
  provider,
  feeRate,
  signer,
}: {
  payload?: AlkanesPayload
  tweakedTaprootKeyPair: bitcoin.Signer
  gatheredUtxos: GatheredUtxos
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createDeployCommit({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
  })
  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })

  const signedHexPsbt = rawPsbt.extractTransaction().toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalPsbt } = await createDeployCommit({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
    fee: correctFee,
  })

  const { signedPsbt: signedAll } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
    network: account.network,
  })

  const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const actualDeployRevealFee = async ({
  createReserveNumber,
  tweakedTaprootKeyPair,
  commitTxId,
  receiverAddress,
  script,
  provider,
  feeRate,
}: {
  createReserveNumber: string
  tweakedTaprootKeyPair: bitcoin.Signer
  commitTxId: string
  receiverAddress: string
  script: Buffer
  provider: Provider
  feeRate?: number
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbtHex } = await createDeployReveal({
    createReserveNumber,
    commitTxId,
    receiverAddress,
    script,
    tweakedTaprootKeyPair,
    provider,
    feeRate,
  })

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([psbtHex])
  )[0].vsize

  console.log(await provider.sandshrew.bitcoindRpc.testMemPoolAccept([psbtHex]))

  const correctFee = vsize * feeRate

  console.log(correctFee)

  const { psbtHex: finalPsbtHex } = await createDeployReveal({
    createReserveNumber,
    commitTxId,
    receiverAddress,
    script,
    tweakedTaprootKeyPair,
    provider,
    feeRate,
    fee: correctFee,
  })

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalPsbtHex])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const actualExecuteFee = async ({
  gatheredUtxos,
  account,
  calldata,
  provider,
  feeRate,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  calldata: bigint[]
  provider: Provider
  feeRate: number
  signer: Signer
}) => {
  if (!feeRate) {
    feeRate = (await provider.esplora.getFeeEstimates())['1']
  }

  const { psbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    calldata,
    provider,
    feeRate,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: psbt,
    finalize: true,
  })

  let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
    network: account.network,
  })
    .extractTransaction()
    .toHex()

  const vsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt])
  )[0].vsize

  const correctFee = vsize * feeRate

  const { psbt: finalPsbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    calldata,
    provider,
    feeRate,
    fee: correctFee,
  })

  const { signedPsbt: finalSignedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  let finalRawPsbt = bitcoin.Psbt.fromBase64(finalSignedPsbt, {
    network: account.network,
  })
    .extractTransaction()
    .toHex()

  const finalVsize = (
    await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalRawPsbt])
  )[0].vsize

  const finalFee = finalVsize * feeRate

  return { fee: finalFee }
}

export const send = async ({
  gatheredUtxos,
  toAddress,
  amount,
  alkaneId,
  feeRate,
  account,
  provider,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  toAddress: string
  amount: number
  alkaneId: AlkaneId
  feeRate?: number
  account: Account
  provider: Provider
  signer: Signer
}) => {
  const { fee } = await actualSendFee({
    gatheredUtxos,
    account,
    alkaneId,
    amount,
    provider,
    toAddress,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt } = await createSendPsbt({
    gatheredUtxos,
    account,
    alkaneId,
    amount,
    provider,
    toAddress,
    feeRate,
    fee,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const result = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return result
}

export const deployCommit = async ({
  payload,
  gatheredUtxos,
  account,
  provider,
  feeRate,
  signer,
}: {
  payload?: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )
  const { fee: commitFee } = await actualDeployCommitFee({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt, script } = await createDeployCommit({
    payload,
    gatheredUtxos,
    tweakedTaprootKeyPair,
    account,
    provider,
    feeRate,
    fee: commitFee,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const result = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return { ...result, script: script.toString('hex') }
}

export const deployReveal = async ({
  createReserveNumber,
  commitTxId,
  script,
  account,
  provider,
  feeRate,
  signer,
}: {
  createReserveNumber: string
  commitTxId: string
  script: string
  account: Account
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const tweakedTaprootKeyPair: bitcoin.Signer = tweakSigner(
    signer.taprootKeyPair,
    {
      network: provider.network,
    }
  )

  const { fee } = await actualDeployRevealFee({
    createReserveNumber,
    tweakedTaprootKeyPair,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
  })

  const { psbt: finalRevealPsbt } = await createDeployReveal({
    createReserveNumber,
    tweakedTaprootKeyPair,
    receiverAddress: account.taproot.address,
    commitTxId,
    script: Buffer.from(script, 'hex'),
    provider,
    feeRate,
    fee,
  })

  const revealResult = await provider.pushPsbt({
    psbtBase64: finalRevealPsbt,
  })

  return revealResult
}

export const execute = async ({
  gatheredUtxos,
  account,
  calldata,
  provider,
  feeRate,
  signer,
}: {
  gatheredUtxos: GatheredUtxos
  account: Account
  calldata: bigint[]
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const { fee } = await actualExecuteFee({
    gatheredUtxos,
    account,
    calldata,
    provider,
    feeRate,
    signer,
  })

  const { psbt: finalPsbt } = await createExecutePsbt({
    gatheredUtxos,
    account,
    calldata,
    provider,
    feeRate,
    fee,
  })

  const { signedPsbt } = await signer.signAllInputs({
    rawPsbt: finalPsbt,
    finalize: true,
  })

  const revealResult = await provider.pushPsbt({
    psbtBase64: signedPsbt,
  })

  return revealResult
}
