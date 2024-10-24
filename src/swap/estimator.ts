import { MarketplaceOffer, MarketplaceBatchOffer } from './types';
import { getUTXOsToCoverAmount } from './helpers';
import { AddressType, getAddressType } from ".."
import { FormattedUtxo } from '../shared/interface';
import { estimatePsbtFee, } from './helpers';

interface TxAddressTypes {
    inputAddressTypes: AddressType[]
    outputAddressTypes: AddressType[]
}



function getInputsAndOutputsForPaddingUtxos(offer: MarketplaceOffer | MarketplaceBatchOffer): { inputs: AddressType[], outputs: AddressType[] } {
    const numberOfOffers = Array.isArray(offer.offerId) ? offer.offerId.length : 1;
    const inputs: AddressType[] = Array(2 + numberOfOffers).fill(AddressType.P2SH_P2WPKH);
    const outputs: AddressType[] = Array(3).fill(AddressType.P2SH_P2WPKH);

    return { inputs, outputs };
}

function getInputsAndOutputsForSellerUtxos(offer: MarketplaceOffer | MarketplaceBatchOffer): { inputs: AddressType[], outputs: AddressType[] } {
    const sellerAddresses = Array.isArray(offer.address) ? offer.address : [offer.address];

    const inputs: AddressType[] = sellerAddresses.map(address => getAddressType(address));
    const outputs: AddressType[] = sellerAddresses.map(address => getAddressType(address));;

    return { inputs, outputs };
}

function getInputsAndOutputsForBuyerUtxos(
    offer: MarketplaceOffer | MarketplaceBatchOffer,
    paymentAddress: string,
    receiveAddress: string,
    paymentUtxos: FormattedUtxo[]
): { inputs: AddressType[], outputs: AddressType[], usedUtxos: FormattedUtxo[] } {
    const totalPrice = Array.isArray(offer.totalPrice)
        ? offer.totalPrice.reduce((sum, price) => sum + price, 0)
        : offer.totalPrice || 0;

    const usedUtxos = getUTXOsToCoverAmount({ utxos: paymentUtxos, amountNeeded: totalPrice });
    const inputs: AddressType[] = usedUtxos.map(() => getAddressType(paymentAddress));

    const numberOfOffers = Array.isArray(offer.offerId) ? offer.offerId.length : 1;
    const outputs: AddressType[] = [
        ...Array(numberOfOffers).fill(getAddressType(receiveAddress)),
        getAddressType(paymentAddress)
    ];

    return { inputs, outputs, usedUtxos };
}



function getUnisatOrdinalsOfferFees(
    offer: MarketplaceOffer | MarketplaceBatchOffer,
    paymentAddress: string,
    receiveAddress: string,
    paymentUtxos: FormattedUtxo[],
    feeRate: number
): { estimatedSelectedUtxos: FormattedUtxo[], totalCost: number } {
    const padding = getInputsAndOutputsForPaddingUtxos(offer);
    const seller = getInputsAndOutputsForSellerUtxos(offer);
    const buyer = getInputsAndOutputsForBuyerUtxos(offer, paymentAddress, receiveAddress, paymentUtxos);

    const allInputs = [...padding.inputs, ...seller.inputs, ...buyer.inputs];
    const allOutputs = [...padding.outputs, ...seller.outputs, ...buyer.outputs];

    const txAddressTypes: TxAddressTypes = {
        inputAddressTypes: allInputs.map(input => input),
        outputAddressTypes: allOutputs.map(output => output)
    };

    const feeCost = estimatePsbtFee({ txAddressTypes }) * feeRate;
    const offerPrice = Array.isArray(offer.totalPrice)
        ? offer.totalPrice.reduce((sum, price) => sum + price, 0)
        : offer.totalPrice || 0;

    const totalCost = feeCost + offerPrice;

    let estimatedSelectedUtxos = buyer.usedUtxos;
    const totalSelectedAmount = estimatedSelectedUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);

    if (totalSelectedAmount < totalCost) {
        const additionalUtxos = getUTXOsToCoverAmount({
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