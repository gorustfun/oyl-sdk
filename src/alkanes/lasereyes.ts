import { minimumFee } from '../btc'
import { u128, u32 } from '@magiceden-oss/runestone-lib/dist/src/integer'
import { Account, Signer, Provider } from '..'
import { ProtoStone, encodeRunestoneProtostone } from 'alkanes/lib/index.js'
import { ProtoruneRuneId } from 'alkanes/lib/protorune/protoruneruneid'
import { OylTransactionError } from '../errors'
import { AlkaneId, AlkanesPayload, GatheredUtxos } from '../shared/interface'
import * as bitcoin from 'bitcoinjs-lib'
import {
  timeout,
  findXAmountOfSats,
  inscriptionSats,
  formatInputsToSign,
  getAddressType,
  calculateUtxoFeesAndGather,
} from '../shared/utils'
import { deployCommit, executeReveal, findAlkaneUtxos } from './alkanes'

interface SendPsbtParams {
  gatheredUtxos: GatheredUtxos
  account: Account
  alkaneId: AlkaneId
  provider: Provider
  toAddress: string
  amount: number
  feeRate?: number
  fee?: number
}



export const tokenDeployment = async ({
  payload,
  gatheredUtxos,
  account,
  protostone,
  provider,
  feeRate,
  signer,
}: {
  payload: AlkanesPayload
  gatheredUtxos: GatheredUtxos
  account: Account
  protostone: Buffer
  provider: Provider
  feeRate?: number
  signer: Signer
}) => {
  const { script, txId } = await deployCommit({
    payload,
    gatheredUtxos,
    account,
    provider,
    feeRate,
    signer,
  })

  await timeout(3000)

  const reveal = await executeReveal({
    protostone,
    script,
    commitTxId: txId,
    account,
    provider,
    feeRate,
    signer,
  })

  return { ...reveal, commitTx: txId }
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
}: SendPsbtParams) => {
  try {
    const { updatedUtxos, finalFee } = calculateUtxoFeesAndGather({
      gatheredUtxos,
      feeRate,
      fee,
    });
    
    const { alkaneUtxos, totalSatoshis } = await findAlkaneUtxos({
      address: account.taproot.address,
      greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
      alkaneId,
      provider,
      targetNumberOfAlkanes: amount,
    });

    if (alkaneUtxos.length === 0) {
      throw new OylTransactionError(Error('No Alkane Utxos Found'))
    }

    let psbt = new bitcoin.Psbt({ network: provider.network });

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

    if (updatedUtxos.totalAmount < finalFee + inscriptionSats * 2) {
      throw new OylTransactionError(Error('Insufficient Balance'))
    }

    for (let i = 0; i < updatedUtxos.utxos.length; i++) {
      if (getAddressType(updatedUtxos.utxos[i].address) === 0) {
        const previousTxHex: string = await provider.esplora.getTxHex(
          updatedUtxos.utxos[i].txId
        )
        psbt.addInput({
          hash: updatedUtxos.utxos[i].txId,
          index: updatedUtxos.utxos[i].outputIndex,
          nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
        })
      }
      if (getAddressType(updatedUtxos.utxos[i].address) === 2) {
        const redeemScript = bitcoin.script.compile([
          bitcoin.opcodes.OP_0,
          bitcoin.crypto.hash160(
            Buffer.from(account.nestedSegwit.pubkey, 'hex')
          ),
        ])

        psbt.addInput({
          hash: updatedUtxos.utxos[i].txId,
          index: updatedUtxos.utxos[i].outputIndex,
          redeemScript: redeemScript,
          witnessUtxo: {
            value: updatedUtxos.utxos[i].satoshis,
            script: bitcoin.script.compile([
              bitcoin.opcodes.OP_HASH160,
              bitcoin.crypto.hash160(redeemScript),
              bitcoin.opcodes.OP_EQUAL,
            ]),
          },
        })
      }
      if (
        getAddressType(updatedUtxos.utxos[i].address) === 1 ||
        getAddressType(updatedUtxos.utxos[i].address) === 3
      ) {
        psbt.addInput({
          hash: updatedUtxos.utxos[i].txId,
          index: updatedUtxos.utxos[i].outputIndex,
          witnessUtxo: {
            value: updatedUtxos.utxos[i].satoshis,
            script: Buffer.from(updatedUtxos.utxos[i].scriptPk, 'hex'),
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
      updatedUtxos.totalAmount +
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
