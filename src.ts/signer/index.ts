import * as bitcoin from 'bitcoinjs-lib'
import { AddressType } from '../shared/interface'
import { ECPair, getNetwork, tweakSigner } from '../shared/utils'
import { publicKeyToAddress } from '../wallet/accounts'
import { ECPairInterface } from 'ecpair'

export class Signer {
  network: bitcoin.Network
  privateKey: string
  publicKey: string
  scriptAddress: string
  addressType: AddressType
  keypair: ECPairInterface

  constructor(
    network: bitcoin.Network,
    privateKey: string,
    addressType: AddressType
  ) {
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'))
    this.keypair = keyPair
    this.network = network
    this.publicKey = keyPair.publicKey.toString('hex')
    this.privateKey = keyPair.privateKey.toString('hex')
    this.scriptAddress = publicKeyToAddress(
      this.publicKey,
      addressType,
      this.network
    )
  }

  async SignInput({
    rawTxn,
    inputNumber,
  }: {
    rawTxn: string
    inputNumber: number
  }) {
    let unSignedTxn = bitcoin.Psbt.fromBase64(rawTxn)

    unSignedTxn.signInput(inputNumber, this.keypair, [
      bitcoin.Transaction.SIGHASH_ALL,
    ])

    const finalTx = unSignedTxn
      .finalizeInput(inputNumber)
      .extractTransaction()
      .toHex()
    console.log(finalTx)

    return { signedRawTxn: finalTx }
  }

  async SignTaprootInput({
    rawTxn,
    inputNumber,
  }: {
    rawTxn: string
    inputNumber: number
  }) {
    let unSignedTxn = bitcoin.Psbt.fromBase64(rawTxn)
    const tweakedSigner = tweakSigner(this.keypair)
    unSignedTxn.signInput(inputNumber, tweakedSigner, [
      bitcoin.Transaction.SIGHASH_ALL,
    ])

    const finalTx = unSignedTxn.finalizeAllInputs().extractTransaction().toHex()
    const finalTxId = unSignedTxn
      .finalizeAllInputs()
      .extractTransaction()
      .getId()
    console.log(finalTx)

    return { signedRawTxn: finalTx, signedTxnId: finalTxId }
  }

  async SignAllTaprootInputs({ rawTxn }: { rawTxn: string }) {
    let unSignedTxn = bitcoin.Psbt.fromBase64(rawTxn)
    const tweakedSigner = tweakSigner(this.keypair)
    unSignedTxn.signAllInputs(tweakedSigner, [bitcoin.Transaction.SIGHASH_ALL])
    const finalTx = unSignedTxn.finalizeAllInputs().extractTransaction().toHex()
    const finalTxId = unSignedTxn
      .finalizeAllInputs()
      .extractTransaction()
      .getId()
    console.log(finalTx)

    return { signedRawTxn: finalTx, signedTxnId: finalTxId }
  }

  async SignAllInputs({ rawTxn }: { rawTxn: string }) {
    let unSignedTxn = bitcoin.Psbt.fromBase64(rawTxn)
    unSignedTxn.signAllInputs(this.keypair, [bitcoin.Transaction.SIGHASH_ALL])
    const finalTx = unSignedTxn.finalizeAllInputs().extractTransaction().toHex()
    const finalTxId = unSignedTxn
      .finalizeAllInputs()
      .extractTransaction()
      .getId()
    console.log(finalTx)

    return { signedRawTxn: finalTx, signedTxnId: finalTxId }
  }

  async SignMessage({ messageToSign }: { messageToSign: string }) {
    const signedMessage = this.keypair.sign(Buffer.from(messageToSign))
    console.log(signedMessage)

    return signedMessage
  }
}
