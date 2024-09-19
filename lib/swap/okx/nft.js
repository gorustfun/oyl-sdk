"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDummyAndPaymentUtxos = exports.mergeSignedPsbt = exports.genBrcAndOrdinalUnsignedPsbt = void 0;
const helpers_1 = require("../helpers");
const coin_bitcoin_1 = require("@okxweb3/coin-bitcoin");
function genBrcAndOrdinalUnsignedPsbt({ address, utxos, network, pubKey, orderPrice, sellerPsbt, feeRate, receiveAddress, nOffers }) {
    const data = buildDummyAndPaymentUtxos({ utxos, feeRate, orderPrice, address, receiveAddress, sellerPsbt, nOffers });
    const buyingData = data;
    const buyerPsbt = (0, coin_bitcoin_1.generateUnsignedBuyingPsbt)(buyingData, network, pubKey);
    //base64 format
    return buyerPsbt;
}
exports.genBrcAndOrdinalUnsignedPsbt = genBrcAndOrdinalUnsignedPsbt;
function mergeSignedPsbt(signedBuyerPsbt, sellerPsbt) {
    const mergedPsbt = (0, coin_bitcoin_1.mergeSignedBuyingPsbt)(signedBuyerPsbt, sellerPsbt);
    return mergedPsbt.toBase64();
}
exports.mergeSignedPsbt = mergeSignedPsbt;
function buildDummyAndPaymentUtxos({ utxos, feeRate, orderPrice, address, receiveAddress, sellerPsbt, nOffers }) {
    const allUtxosWorth600 = (0, helpers_1.getAllUTXOsWorthASpecificValue)(utxos, 600);
    if (allUtxosWorth600.length < nOffers + 1) {
        throw new Error('not enough padding utxos (600 sat) for marketplace buy');
    }
    const dummyUtxos = [];
    for (let i = 0; i < nOffers + 1; i++) {
        dummyUtxos.push({
            txHash: allUtxosWorth600[i].txId,
            vout: allUtxosWorth600[i].outputIndex,
            coinAmount: allUtxosWorth600[i].satoshis,
        });
    }
    const amountNeeded = orderPrice + parseInt((helpers_1.ESTIMATE_TX_SIZE * feeRate).toFixed(0));
    const retrievedUtxos = (0, helpers_1.getUTXOsToCoverAmount)({
        utxos,
        amountNeeded,
        excludedUtxos: allUtxosWorth600
    });
    if (retrievedUtxos.length === 0) {
        throw new Error('Not enough funds to purchase this offer');
    }
    const paymentUtxos = [];
    retrievedUtxos.forEach((utxo) => {
        paymentUtxos.push({
            txHash: utxo.txId,
            vout: utxo.outputIndex,
            coinAmount: utxo.satoshis,
        });
    });
    const data = {
        dummyUtxos,
        paymentUtxos,
    };
    data['receiveNftAddress'] = receiveAddress;
    data['paymentAndChangeAddress'] = address;
    data['feeRate'] = feeRate;
    data['sellerPsbts'] = [sellerPsbt];
    return data;
}
exports.buildDummyAndPaymentUtxos = buildDummyAndPaymentUtxos;
//# sourceMappingURL=nft.js.map