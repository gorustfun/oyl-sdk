import { ESTIMATE_TX_SIZE, getAllUTXOsWorthASpecificValue, getUTXOsToCoverAmount } from "../helpers"
import { GenOkxBrcAndCollectibleUnsignedPsbt, PaymentUtxoOptions } from "../types"
import {
    generateUnsignedBuyingPsbt,
    mergeSignedBuyingPsbt,
    BuyingData,
} from '@okxweb3/coin-bitcoin'


export function genBrcAndOrdinalUnsignedPsbt({
    address,
    utxos,
    network,
    pubKey,
    orderPrice,
    sellerPsbt,
    feeRate,
    receiveAddress,
    nOffers
}: GenOkxBrcAndCollectibleUnsignedPsbt
): string {
    const data = buildDummyAndPaymentUtxos({ utxos, feeRate, orderPrice, address, receiveAddress, sellerPsbt, nOffers }) as any

    const buyingData: BuyingData = data
    const buyerPsbt = generateUnsignedBuyingPsbt(
        buyingData,
        network,
        pubKey
    )
    //base64 format
    return buyerPsbt
}



export function mergeSignedPsbt(signedBuyerPsbt: string, sellerPsbt: string[]): string {
    const mergedPsbt = mergeSignedBuyingPsbt(signedBuyerPsbt, sellerPsbt)
    return mergedPsbt.toBase64()
}



export function buildDummyAndPaymentUtxos({ utxos, feeRate, orderPrice, address, receiveAddress, sellerPsbt, nOffers }: PaymentUtxoOptions) {
    const allUtxosWorth600 = getAllUTXOsWorthASpecificValue(utxos, 600)
    if (allUtxosWorth600.length < nOffers + 1) {
        throw new Error('not enough padding utxos (600 sat) for marketplace buy')
    }

    const dummyUtxos = []
    for (let i = 0; i < nOffers + 1; i++) {
        dummyUtxos.push({
            txHash: allUtxosWorth600[i].txId,
            vout: allUtxosWorth600[i].outputIndex,
            coinAmount: allUtxosWorth600[i].satoshis,
        })
    }

    const amountNeeded = orderPrice + parseInt((ESTIMATE_TX_SIZE * feeRate).toFixed(0))
    const retrievedUtxos = getUTXOsToCoverAmount({
        utxos,
        amountNeeded,
        excludedUtxos: allUtxosWorth600
    })
    if (retrievedUtxos.length === 0) {
        throw new Error('Not enough funds to purchase this offer')
    }

    const paymentUtxos = []
    retrievedUtxos.forEach((utxo) => {
        paymentUtxos.push({
            txHash: utxo.txId,
            vout: utxo.outputIndex,
            coinAmount: utxo.satoshis,
        })
    })

    const data = {
        dummyUtxos,
        paymentUtxos,
    }

    data['receiveNftAddress'] = receiveAddress
    data['paymentAndChangeAddress'] = address
    data['feeRate'] = feeRate
    data['sellerPsbts'] = [sellerPsbt]

    return data
}