"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnisatOrdinalsOfferFees = void 0;
const helpers_1 = require("./helpers");
const __1 = require("..");
const helpers_2 = require("./helpers");
function getInputsAndOutputsForPaddingUtxos(offer) {
    const numberOfOffers = Array.isArray(offer.offerId) ? offer.offerId.length : 1;
    const inputs = Array(2 + numberOfOffers).fill(__1.AddressType.P2SH_P2WPKH);
    const outputs = Array(3).fill(__1.AddressType.P2SH_P2WPKH);
    return { inputs, outputs };
}
function getInputsAndOutputsForSellerUtxos(offer) {
    const sellerAddresses = Array.isArray(offer.address) ? offer.address : [offer.address];
    const inputs = sellerAddresses.map(address => (0, __1.getAddressType)(address));
    const outputs = sellerAddresses.map(address => (0, __1.getAddressType)(address));
    ;
    return { inputs, outputs };
}
function getInputsAndOutputsForBuyerUtxos(offer, paymentAddress, receiveAddress, paymentUtxos) {
    const totalPrice = Array.isArray(offer.totalPrice)
        ? offer.totalPrice.reduce((sum, price) => sum + price, 0)
        : offer.totalPrice || 0;
    const usedUtxos = (0, helpers_1.getUTXOsToCoverAmount)({ utxos: paymentUtxos, amountNeeded: totalPrice });
    const inputs = usedUtxos.map(() => (0, __1.getAddressType)(paymentAddress));
    const numberOfOffers = Array.isArray(offer.offerId) ? offer.offerId.length : 1;
    const outputs = [
        ...Array(numberOfOffers).fill((0, __1.getAddressType)(receiveAddress)),
        (0, __1.getAddressType)(paymentAddress)
    ];
    return { inputs, outputs, usedUtxos };
}
function getUnisatOrdinalsOfferFees(offer, paymentAddress, receiveAddress, paymentUtxos, feeRate) {
    const padding = getInputsAndOutputsForPaddingUtxos(offer);
    const seller = getInputsAndOutputsForSellerUtxos(offer);
    const buyer = getInputsAndOutputsForBuyerUtxos(offer, paymentAddress, receiveAddress, paymentUtxos);
    const allInputs = [...padding.inputs, ...seller.inputs, ...buyer.inputs];
    const allOutputs = [...padding.outputs, ...seller.outputs, ...buyer.outputs];
    const txAddressTypes = {
        inputAddressTypes: allInputs.map(input => input),
        outputAddressTypes: allOutputs.map(output => output)
    };
    const feeCost = (0, helpers_2.estimatePsbtFee)({ txAddressTypes }) * feeRate;
    const offerPrice = Array.isArray(offer.totalPrice)
        ? offer.totalPrice.reduce((sum, price) => sum + price, 0)
        : offer.totalPrice || 0;
    const totalCost = feeCost + offerPrice;
    let estimatedSelectedUtxos = buyer.usedUtxos;
    const totalSelectedAmount = estimatedSelectedUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    if (totalSelectedAmount < totalCost) {
        const additionalUtxos = (0, helpers_1.getUTXOsToCoverAmount)({
            utxos: paymentUtxos,
            amountNeeded: totalCost - totalSelectedAmount,
            excludedUtxos: estimatedSelectedUtxos
        });
        estimatedSelectedUtxos = [...estimatedSelectedUtxos, ...additionalUtxos];
    }
    return {
        estimatedSelectedUtxos,
        totalCost
    };
}
exports.getUnisatOrdinalsOfferFees = getUnisatOrdinalsOfferFees;
//# sourceMappingURL=estimator.js.map